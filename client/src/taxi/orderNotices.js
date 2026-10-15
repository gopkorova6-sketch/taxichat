import { statusLabel } from "./statusLabels";

// Voice and on-screen notices for order changes, shared by all roles.
// Each notice is spoken (speak: true) and disappears after 60 seconds.
export const orderStatusNotice = (payload) => {
  const label = statusLabel(payload?.status);
  return {
    message: `Заказ: ${label}`,
    speakText: `Заказ. ${label}`,
    type: payload?.status === "DISPUTE" ? "error" : "info",
    speak: true,
  };
};

export const newOrderNotice = () => ({
  message: "Новый заказ в городе",
  speakText: "Новый заказ в городе",
  type: "info",
  speak: true,
});

export const newOfferNotice = () => ({
  message: "Новый отклик водителя",
  speakText: "Новый отклик водителя",
  type: "info",
  speak: true,
});
