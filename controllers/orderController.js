const { z } = require("zod");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Offer = require("../models/Offer");
const Chat = require("../models/Chat");
const Zone = require("../models/Zone");
const City = require("../models/City");
const Membership = require("../models/Membership");
const DriverProfile = require("../models/DriverProfile");
const Message = require("../models/Message");
const ApiError = require("../utilities/errors");
const catchAsyncError = require("../utilities/catchAsyncError");
const { validateBody } = require("../utilities/catchAsyncError");
const { transition, assignAtomically } = require("../services/orderService");
const {
  toPassengerView,
  toDriverView,
  toDispatcherView,
} = require("../utilities/orderViews");
const { emitOrderEvents } = require("../utilities/sockets");
const botDispatcher = require("../services/botDispatcher");

const createOrderSchema = z
  .object({
    cityId: z.string().min(1, "Не указан город"),
    fromZoneId: z.string().min(1, "Укажите зону отправления"),
    toZoneId: z.string().optional(),
    fromText: z.string().trim().max(200, "Адрес слишком длинный").optional(),
    fromLandmarkId: z.string().optional(),
    toText: z.string().trim().max(200).optional(),
    toLandmarkId: z.string().optional(),
    exactFrom: z.string().trim().max(300).optional(),
    exactTo: z.string().trim().max(300).optional(),
    whenType: z.enum(["now", "scheduled"]).default("now"),
    whenAt: z.string().datetime({ offset: true }).optional(),
    pax: z.number().int().min(1, "Минимум 1 пассажир").max(8).default(1),
    notes: z.string().trim().max(500).optional(),
    matchMode: z.enum(["offers", "first_take", "dispatcher"]).optional(),
    targetDriverId: z.string().optional(),
    chatId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.fromText && !data.fromLandmarkId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите место отправления",
        path: ["fromText"],
      });
    if (!data.toText && !data.toLandmarkId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите место назначения",
        path: ["toText"],
      });
    if (data.whenType === "scheduled" && !data.whenAt)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите время поездки",
        path: ["whenAt"],
      });
  });

const offerSchema = z.object({
  priceText: z.string().trim().min(1, "Укажите цену").max(50, "Слишком длинная цена"),
  etaMin: z
    .number()
    .int()
    .min(1, "Укажите время подачи")
    .max(180, "Время подачи не больше 180 минут"),
});

const acceptSchema = z.object({
  offerId: z.string().optional(),
});

const assignSchema = z.object({
  membershipId: z.string().min(1, "Укажите водителя"),
});

const actionSchema = z.object({
  action: z.enum(["arrive", "wait", "start", "finish", "no_show", "undo_start"]),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Укажите причину отмены").max(300),
});

const disputeSchema = z.object({
  reason: z.string().trim().min(1, "Опишите проблему").max(300),
});

exports.createOrderSchema = createOrderSchema;
exports.offerSchema = offerSchema;
exports.acceptSchema = acceptSchema;
exports.assignSchema = assignSchema;
exports.actionSchema = actionSchema;
exports.cancelSchema = cancelSchema;
exports.disputeSchema = disputeSchema;

// DriverProfile is keyed by membership; resolve it through the membership
const driverProfileForOrder = async (order) => {
  if (!order.driverId) return null;
  const membership = await Membership.findOne({ userId: order.driverId, role: "driver" });
  if (!membership) return null;
  return DriverProfile.findOne({ membershipId: membership._id });
};

const serializeOrderFor = async (order, req) => {
  const viewerId = String(req.user._id);
  const isDispatcher =
    (req.memberships ?? []).some(
      (item) =>
        item.role === "dispatcher" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(order.cityId)
    ) || req.user.isSuperadmin === true;

  if (String(order.passengerId) === viewerId) {
    return toPassengerView(order, {
      driverProfile: await driverProfileForOrder(order),
    });
  }
  if (isDispatcher) {
    return toDispatcherView(order, {
      driverProfile: await driverProfileForOrder(order),
    });
  }
  return toDriverView(order, { viewerId });
};

// POST /api/orders
exports.createOrder = [
  validateBody(createOrderSchema),
  catchAsyncError(async (req, res) => {
    const data = req.body;

    const city = await City.findById(data.cityId);
    if (!city) throw new ApiError(404, "Город не найден");
    if (!["PILOT", "ACTIVE"].includes(city.status))
      throw new ApiError(403, "В вашем городе заказы ещё не открыты");

    const passengerMembership = (req.memberships ?? []).find(
      (item) =>
        item.role === "passenger" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(data.cityId)
    );
    if (!passengerMembership)
      throw new ApiError(403, "Вы не пассажир этого города");

    const fromZone = await Zone.findOne({ _id: data.fromZoneId, cityId: data.cityId });
    if (!fromZone) throw new ApiError(400, "Зона отправления не относится к городу");

    let toZone = null;
    if (data.toZoneId) {
      toZone = await Zone.findOne({ _id: data.toZoneId, cityId: data.cityId });
      if (!toZone) throw new ApiError(400, "Зона назначения не относится к городу");
    }

    const matchMode = data.matchMode ?? city.settings?.matchMode ?? "offers";

    // Direct order placed after a call to a free driver (concept 1.6)
    let directContext = null;
    if (data.targetDriverId) {
      if (city.settings?.directCallsEnabled === false)
        throw new ApiError(403, "Прямые вызовы водителей отключены в этом городе");

      const targetMembership = await Membership.findOne({
        userId: data.targetDriverId,
        cityId: data.cityId,
        role: "driver",
        status: "ACTIVE",
      });
      if (!targetMembership)
        throw new ApiError(400, "Целевой водитель не найден в этом городе");

      const targetProfile = await DriverProfile.findOne({
        membershipId: targetMembership._id,
      });
      if (data.whenType === "now" && (!targetProfile || targetProfile.shift !== "online"))
        throw new ApiError(409, "Водитель сейчас не на линии");
      if (data.whenType === "now") {
        const busy = await Order.exists({
          driverId: data.targetDriverId,
          status: { $in: ["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"] },
        });
        if (busy) throw new ApiError(409, "У водителя уже есть активный заказ");
      }

      directContext = { targetMembership, targetProfile };
    }

    const order = await Order.create({
      passengerId: req.user._id,
      cityId: data.cityId,
      fromZone: fromZone._id,
      ...(toZone && { toZone: toZone._id }),
      from: {
        ...(data.fromText && { text: data.fromText }),
        ...(data.fromLandmarkId && { landmarkId: data.fromLandmarkId }),
      },
      to: {
        ...(data.toText && { text: data.toText }),
        ...(data.toLandmarkId && { landmarkId: data.toLandmarkId }),
      },
      ...(data.exactFrom && { exactFrom: data.exactFrom }),
      ...(data.exactTo && { exactTo: data.exactTo }),
      when: { type: data.whenType, ...(data.whenAt && { at: new Date(data.whenAt) }) },
      pax: data.pax,
      ...(data.notes && { notes: data.notes }),
      matchMode: data.targetDriverId ? "offers" : matchMode,
      ...(data.targetDriverId && {
        mode: "direct",
        targetDriverId: data.targetDriverId,
      }),
    });

    // Direct orders reuse the existing direct chat as the order chat; the
    // previous conversation and call log stay in place (concept 1.6)
    let chat;
    if (directContext && data.chatId) {
      chat = await Chat.findById(data.chatId);
      if (
        !chat ||
        !chat.members.some((member) => String(member) === String(req.user._id)) ||
        !chat.members.some((member) => String(member) === String(data.targetDriverId))
      ) {
        throw new ApiError(400, "Чат не найден между пассажиром и водителем");
      }
      chat.type = "order";
      chat.orderId = order._id;
      await chat.save();
    } else {
      chat = await Chat.create({
        type: "order",
        cityId: data.cityId,
        orderId: order._id,
        members: [req.user._id],
      });
    }
    order.chatId = chat._id;

    const actor = { userId: req.user._id, role: "passenger" };
    const { events } = await transition(order, "publish", actor);

    const timeoutSeconds =
      directContext
        ? (city.settings?.directOrderTimeoutMin ?? 10) * 60
        : (city.settings?.cascadeTimeouts?.expire ?? 300);
    order.expiresAt = new Date(Date.now() + timeoutSeconds * 1000);
    await order.save();
    await botDispatcher.upsertOrderCard(order);

    // Cascade fan-out, expiry and preorder timers (concept 1.6 / 1.14)
    const { scheduleOrderJobs } = require("../jobs/index");
    await scheduleOrderJobs(order);

    // Direct orders go to the target driver only; broadcast orders fan out
    // to the zone of departure and the city (concept 1.6)
    if (order.mode !== "direct") {
      events.push(
        { room: `zone:${fromZone._id}`, event: "order:new", payload: { orderId: order._id } },
        { room: `city:${data.cityId}`, event: "order:new", payload: { orderId: order._id } }
      );
    }
    emitOrderEvents(events);

    res.status(201).json({
      status: "success",
      data: { order: await serializeOrderFor(order, req) },
    });
  }),
];

// GET /api/orders?cityId=&status=
// Passenger: own orders; driver: cards of his zones; dispatcher: city queue
exports.listOrders = catchAsyncError(async (req, res) => {
  const { cityId, status } = req.query;
  if (!cityId) throw new ApiError(400, "Не указан город");

  const statusFilter = status ? { status } : {};

  const driverMembership = (req.memberships ?? []).find(
    (item) =>
      item.role === "driver" &&
      item.status === "ACTIVE" &&
      String(item.cityId?._id ?? item.cityId) === String(cityId)
  );
  const dispatcherMembership = (req.memberships ?? []).find(
    (item) =>
      item.role === "dispatcher" &&
      item.status === "ACTIVE" &&
      String(item.cityId?._id ?? item.cityId) === String(cityId)
  );

  let orders;

  if (driverMembership) {
    // Orders of the driver's zones, plus his own assigned orders
    const zoneIds = driverMembership.zones ?? [];
    orders = await Order.find({
      cityId,
      ...statusFilter,
      $or: [
        { fromZone: { $in: zoneIds } },
        { driverId: req.user._id },
        { targetDriverId: req.user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(100);
  } else if (dispatcherMembership || req.user.isSuperadmin) {
    orders = await Order.find({ cityId, ...statusFilter })
      .sort({ createdAt: -1 })
      .limit(200);
  } else {
    orders = await Order.find({ cityId, passengerId: req.user._id, ...statusFilter })
      .sort({ createdAt: -1 })
      .limit(100);
  }

  const serialized = [];
  for (const order of orders) {
    serialized.push(await serializeOrderFor(order, req));
  }

  res.json({ status: "success", data: { orders: serialized } });
});

// GET /api/orders/:id — participant views only, serialized per role
exports.getOrder = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Некорректный идентификатор заказа");

  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Заказ не найден");

  const viewerId = String(req.user._id);
  const isParticipant =
    String(order.passengerId) === viewerId || String(order.driverId) === viewerId;
  const isDispatcher =
    (req.memberships ?? []).some(
      (item) =>
        item.role === "dispatcher" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(order.cityId)
    ) || req.user.isSuperadmin === true;
  const isPotentialDriver = (req.memberships ?? []).some(
    (item) =>
      item.role === "driver" &&
      item.status === "ACTIVE" &&
      String(item.cityId?._id ?? item.cityId) === String(order.cityId)
  );

  if (!isParticipant && !isDispatcher && !isPotentialDriver)
    throw new ApiError(403, "Нет доступа к этому заказу");

  res.json({
    status: "success",
    data: { order: await serializeOrderFor(order, req) },
  });
});

// POST /api/orders/:id/action — driver lifecycle buttons
exports.orderAction = [
  validateBody(actionSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");

    const actor = { userId: req.user._id, role: "driver" };
    const { events } = await transition(order, req.body.action, actor);
    emitOrderEvents(events);

    res.json({
      status: "success",
      data: { order: await serializeOrderFor(order, req) },
    });
  }),
];

// POST /api/orders/:id/cancel — any participant with a mandatory reason
exports.cancelOrder = [
  validateBody(cancelSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");

    const role = String(order.passengerId) === String(req.user._id) ? "passenger" : "driver";
    const actor = { userId: req.user._id, role };
    const { events } = await transition(order, "cancel", actor, { reason: req.body.reason });
    emitOrderEvents(events);

    res.json({
      status: "success",
      data: { order: await serializeOrderFor(order, req) },
    });
  }),
];

// POST /api/orders/:id/dispute — dispatcher joins the chat
exports.openDispute = [
  validateBody(disputeSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");

    const role = String(order.passengerId) === String(req.user._id) ? "passenger" : "driver";
    const actor = { userId: req.user._id, role };
    const { events } = await transition(order, "dispute", actor, { reason: req.body.reason });
    emitOrderEvents(events);

    res.json({
      status: "success",
      data: { order: await serializeOrderFor(order, req) },
    });
  }),
];

// POST /api/orders/:id/offers — driver sends price and ETA
exports.createOffer = [
  validateBody(offerSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");
    if (order.status !== "PUBLISHED")
      throw new ApiError(409, "Заказ больше не принимает отклики");
    if (order.mode === "direct" && String(order.targetDriverId) !== String(req.user._id))
      throw new ApiError(403, "Этот заказ оформлен другому водителю");

    const driverMembership = (req.memberships ?? []).find(
      (item) =>
        item.role === "driver" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(order.cityId)
    );
    if (!driverMembership)
      throw new ApiError(403, "Вы не водитель этого города");

    const existing = await Offer.findOne({
      orderId: order._id,
      driverId: req.user._id,
    });
    if (existing) {
      existing.priceText = req.body.priceText;
      existing.etaMin = req.body.etaMin;
      existing.status = "PENDING";
      await existing.save();
    }
    const offer =
      existing ??
      (await Offer.create({
        orderId: order._id,
        driverId: req.user._id,
        priceText: req.body.priceText,
        etaMin: req.body.etaMin,
      }));

    const profile = await DriverProfile.findOne({ userId: req.user._id });

    emitOrderEvents([
      {
        room: `order:${order._id}`,
        event: "order:offer",
        payload: {
          orderId: order._id,
          offerId: offer._id,
          driverId: req.user._id,
          priceText: offer.priceText,
          etaMin: offer.etaMin,
          carCaption: profile
            ? [profile.car?.color, profile.car?.plate, profile.car?.brand]
                .filter(Boolean)
                .join(" ")
            : undefined,
        },
      },
    ]);

    res.status(201).json({ status: "success", data: { offer } });
  }),
];

// GET /api/orders/:id/offers — passenger and dispatcher see all, driver his own
exports.listOffers = catchAsyncError(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Заказ не найден");

  const isPassenger = String(order.passengerId) === String(req.user._id);
  const isDispatcher =
    (req.memberships ?? []).some(
      (item) =>
        item.role === "dispatcher" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(order.cityId)
    ) || req.user.isSuperadmin === true;

  const filter = { orderId: order._id };
  if (!isPassenger && !isDispatcher) filter.driverId = req.user._id;

  const offers = await Offer.find(filter)
    .populate("driverId", "username name")
    .sort({ createdAt: 1 });

  const driverUserIds = [...new Set(offers.map((offer) => String(offer.driverId._id)))];
  const driverMemberships = await Membership.find({
    userId: { $in: driverUserIds },
    role: "driver",
  }).select("userId _id");
  const profiles = await DriverProfile.find({
    membershipId: { $in: driverMemberships.map((membership) => membership._id) },
  });
  const profileByUser = new Map();
  for (const membership of driverMemberships) {
    const profile = profiles.find(
      (item) => String(item.membershipId) === String(membership._id)
    );
    if (profile) profileByUser.set(String(membership.userId), profile);
  }

  res.json({
    status: "success",
    data: {
      offers: offers.map((offer) => {
        const profile = profileByUser.get(String(offer.driverId._id));
        return {
          _id: offer._id,
          orderId: offer.orderId,
          priceText: offer.priceText,
          etaMin: offer.etaMin,
          status: offer.status,
          driverName: profile?.displayName ?? offer.driverId.name,
          carCaption: profile
            ? [profile.car?.color, profile.car?.plate, profile.car?.brand]
                .filter(Boolean)
                .join(" ")
            : undefined,
        };
      }),
    },
  });
});

// POST /api/orders/:id/accept
// - passenger with offerId picks a driver among the offers
// - driver without offerId takes the order in first_take mode (atomic)
// - direct orders: only the target driver, atomically
exports.acceptOrder = [
  validateBody(acceptSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");

    if (req.body.offerId) {
      // Passenger picks an offer
      if (String(order.passengerId) !== String(req.user._id))
        throw new ApiError(403, "Выбрать водителя может только пассажир");

      const offer = await Offer.findById(req.body.offerId);
      if (!offer || String(offer.orderId) !== String(order._id))
        throw new ApiError(404, "Отклик не найден");
      if (offer.status === "ACCEPTED")
        throw new ApiError(409, "Отклик уже принят");

      const { order: assignedOrder, events } = await assignAtomically(
        order._id,
        offer.driverId,
        { userId: req.user._id, role: "passenger" },
        { priceAgreed: offer.priceText }
      );

      offer.status = "ACCEPTED";
      await offer.save();
      await Offer.updateMany(
        { orderId: order._id, _id: { $ne: offer._id } },
        { $set: { status: "DECLINED" } }
      );

      emitOrderEvents(events);
      return res.json({
        status: "success",
        data: { order: await serializeOrderFor(assignedOrder, req) },
      });
    }

    // Driver takes the order
    const driverMembership = (req.memberships ?? []).find(
      (item) =>
        item.role === "driver" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(order.cityId)
    );
    if (!driverMembership) throw new ApiError(403, "Вы не водитель этого города");

    if (order.mode === "direct") {
      if (String(order.targetDriverId) !== String(req.user._id))
        throw new ApiError(403, "Этот прямой заказ оформлен другому водителю");

      // For "now" orders the driver must still be online and free
      if (order.when?.type !== "scheduled") {
        const targetProfile = await driverProfileForOrder({ driverId: req.user._id });
        if (!targetProfile || targetProfile.shift === "offline")
          throw new ApiError(409, "Вы не на линии: сначала выйдите на смену");

        const busy = await Order.exists({
          driverId: req.user._id,
          status: { $in: ["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"] },
        });
        if (busy) throw new ApiError(409, "У вас уже есть активный заказ");
      }
    } else if (order.matchMode !== "first_take") {
      throw new ApiError(409, "В этом режиме нужно прислать отклик");
    }

    const { order: assignedOrder, events } = await assignAtomically(order._id, req.user._id, {
      userId: req.user._id,
      role: "driver",
    });
    await Offer.updateMany(
      { orderId: order._id, driverId: { $ne: req.user._id } },
      { $set: { status: "DECLINED" } }
    );

    // Remove the card from other drivers' feeds
    events.push(
      { room: `zone:${order.fromZone}`, event: "order:taken", payload: { orderId: order._id } },
      { room: `city:${order.cityId}`, event: "order:taken", payload: { orderId: order._id } }
    );
    emitOrderEvents(events);

    res.json({
      status: "success",
      data: { order: await serializeOrderFor(assignedOrder, req) },
    });
  }),
];

// POST /api/orders/:id/assign — dispatcher assigns a driver manually
exports.assignByDispatcher = [
  validateBody(assignSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");

    const driverMembership = await Membership.findOne({
      _id: req.body.membershipId,
      cityId: order.cityId,
      role: "driver",
      status: "ACTIVE",
    });
    if (!driverMembership)
      throw new ApiError(400, "Водитель не найден в этом городе");

    const { order: assignedOrder, events } = await assignAtomically(
      order._id,
      driverMembership.userId,
      { userId: req.user._id, role: "dispatcher" }
    );

    events.push(
      { room: `zone:${order.fromZone}`, event: "order:taken", payload: { orderId: order._id } },
      { room: `city:${order.cityId}`, event: "order:taken", payload: { orderId: order._id } }
    );
    emitOrderEvents(events);

    res.json({
      status: "success",
      data: { order: await serializeOrderFor(assignedOrder, req) },
    });
  }),
];

// POST /api/orders/:id/decline — the target driver declines a direct order;
// the passenger is then offered to publish it for everyone (concept 1.6)
exports.declineDirectOrder = catchAsyncError(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Заказ не найден");
  if (order.mode !== "direct")
    throw new ApiError(400, "Отклонить можно только прямой заказ");

  const actor = { userId: req.user._id, role: "driver" };
  const { events } = await transition(order, "cancel", actor, {
    reason: req.body?.reason ?? "Водитель отклонил заказ",
  });

  await botDispatcher.postSystemMessage(
    order.chatId,
    "Вы можете опубликовать заказ для всех водителей города"
  );

  emitOrderEvents(events);

  res.json({
    status: "success",
    data: { order: await serializeOrderFor(order, req) },
  });
});

// POST /api/orders/:id/republish — the passenger publishes a declined or
// timed-out direct order as a regular city order (concept 1.6)
exports.republishOrder = catchAsyncError(async (req, res) => {
  const original = await Order.findById(req.params.id);
  if (!original) throw new ApiError(404, "Заказ не найден");
  if (String(original.passengerId) !== String(req.user._id))
    throw new ApiError(403, "Это не ваш заказ");
  if (original.mode !== "direct")
    throw new ApiError(400, "Опубликовать заново можно только прямой заказ");
  if (original.status !== "CANCELLED")
    throw new ApiError(409, "Заказ ещё не отклонён и не истёк");

  const city = await City.findById(original.cityId);
  if (!city) throw new ApiError(404, "Город не найден");
  if (!["PILOT", "ACTIVE"].includes(city.status))
    throw new ApiError(403, "В вашем городе заказы ещё не открыты");

  const order = await Order.create({
    passengerId: original.passengerId,
    cityId: original.cityId,
    fromZone: original.fromZone,
    toZone: original.toZone,
    from: original.from,
    to: original.to,
    exactFrom: original.exactFrom,
    exactTo: original.exactTo,
    when: original.when,
    pax: original.pax,
    notes: original.notes,
    matchMode: city.settings?.matchMode ?? "offers",
    mode: "broadcast",
  });

  const chat = await Chat.create({
    type: "order",
    cityId: order.cityId,
    orderId: order._id,
    members: [req.user._id],
  });
  order.chatId = chat._id;

  const actor = { userId: req.user._id, role: "passenger" };
  const { events } = await transition(order, "publish", actor);

  order.expiresAt = new Date(
    Date.now() + (city.settings?.cascadeTimeouts?.expire ?? 300) * 1000
  );
  await order.save();
  await botDispatcher.upsertOrderCard(order);

  events.push(
    { room: `zone:${order.fromZone}`, event: "order:new", payload: { orderId: order._id } },
    { room: `city:${order.cityId}`, event: "order:new", payload: { orderId: order._id } }
  );
  emitOrderEvents(events);

  const { scheduleOrderJobs } = require("../jobs/index");
  await scheduleOrderJobs(order);

  res.status(201).json({
    status: "success",
    data: { order: await serializeOrderFor(order, req) },
  });
});

// GET /api/orders/:id/messages — order chat history (bot + participants)
exports.listMessages = catchAsyncError(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, "Заказ не найден");

  const isParticipant =
    String(order.passengerId) === String(req.user._id) ||
    String(order.driverId) === String(req.user._id);
  const isDispatcher =
    (req.memberships ?? []).some(
      (item) =>
        item.role === "dispatcher" &&
        item.status === "ACTIVE" &&
        String(item.cityId?._id ?? item.cityId) === String(order.cityId)
    ) || req.user.isSuperadmin === true;

  if (!isParticipant && !isDispatcher)
    throw new ApiError(403, "Нет доступа к чату этого заказа");

  const before = req.query.before ? new Date(req.query.before) : null;
  const filter = { chatId: order.chatId };
  if (before) filter.createdAt = { $lt: before };

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("senderId", "username name");

  res.json({
    status: "success",
    data: {
      messages: messages.reverse().map((message) => ({
        _id: message._id,
        kind: message.kind,
        body: message.body,
        meta: message.meta,
        senderType: message.senderType,
        senderId: message.senderId?._id ?? message.senderId,
        senderName: message.senderId?.name,
        mine: message.senderId
          ? String(message.senderId._id ?? message.senderId) === String(req.user._id)
          : false,
        createdAt: message.createdAt,
      })),
    },
  });
});

// POST /api/orders/:id/messages — text, photo and voice messages
const sendOrderMessageSchema = z.union([
  z.object({
    body: z.string().trim().min(1, "Введите сообщение").max(2000, "Сообщение слишком длинное"),
  }),
  z.object({
    kind: z.literal("photo"),
    imageUrl: z.string().min(1, "Не передано фото"),
  }),
  z.object({
    kind: z.literal("voice"),
    voiceNoteUrl: z.string().min(1, "Не передана голосовая запись"),
    voiceNoteDuration: z
      .number()
      .int()
      .min(1, "Длительность от 1 секунды")
      .max(600, "Голосовое не длиннее 10 минут"),
  }),
]);
exports.sendOrderMessageSchema = sendOrderMessageSchema;

const PHONE_PATTERN = /(\+?7|8)[\s\-()]?\d{3}[\s\-()]?\d{3}[\s\-()]?\d{2}[\s\-()]?\d{2}/;
const URL_PATTERN = /(https?:\/\/|www\.)\S+|\b[\w-]+\.(?:ru|рф|com|net|org)\b/i;

exports.sendOrderMessage = [
  validateBody(sendOrderMessageSchema),
  catchAsyncError(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Заказ не найден");

    const isPassenger = String(order.passengerId) === String(req.user._id);
    const isAssignedDriver = String(order.driverId) === String(req.user._id);
    const isDispatcher =
      (req.memberships ?? []).some(
        (item) =>
          item.role === "dispatcher" &&
          item.status === "ACTIVE" &&
          String(item.cityId?._id ?? item.cityId) === String(order.cityId)
      ) || req.user.isSuperadmin === true;

    if (!isPassenger && !isAssignedDriver && !isDispatcher)
      throw new ApiError(403, "Нет доступа к чату этого заказа");

    // Optional city-level filter for phone numbers and links (concept 1.7)
    const city = await City.findById(order.cityId).select("settings.filterContacts");
    if (city?.settings?.filterContacts && req.body.body) {
      if (PHONE_PATTERN.test(req.body.body) || URL_PATTERN.test(req.body.body)) {
        throw new ApiError(
          400,
          "Отправка телефонных номеров и ссылок запрещена настройками города"
        );
      }
    }

    const message = await Message.create({
      chatId: order.chatId,
      senderId: req.user._id,
      senderType: "user",
      ...(req.body.body
        ? { kind: "text", body: req.body.body }
        : req.body.kind === "photo"
          ? { kind: "photo", body: "Фото", meta: { imageUrl: req.body.imageUrl } }
          : {
              kind: "voice",
              body: "Голосовое сообщение",
              meta: {
                voiceNoteUrl: req.body.voiceNoteUrl,
                voiceNoteDuration: req.body.voiceNoteDuration,
              },
            }),
    });

    emitOrderEvents([
      {
        room: `order:${order._id}`,
        event: "chat:message",
        payload: {
          chatId: String(order.chatId),
          orderId: String(order._id),
          messageId: message._id,
          senderId: req.user._id,
          senderName: req.user.name,
          kind: message.kind,
          body: message.body,
          meta: message.meta,
          createdAt: message.createdAt,
        },
      },
    ]);

    res.status(201).json({
      status: "success",
      data: {
        message: {
          _id: message._id,
          kind: message.kind,
          body: message.body,
          senderId: message.senderId,
          createdAt: message.createdAt,
        },
      },
    });
  }),
];
