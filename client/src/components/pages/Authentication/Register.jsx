import React, { useEffect, useState } from "react";
import * as Yup from "yup";
import { Formik, Form } from "formik";
import FormField from "../../globals/FormField";
import useFetch from "../../../hooks/useFetch";
import { useDispatch } from "react-redux";
import { authActions } from "../../../store/authSlice";
import Spinner from "../../globals/Spinner";

const schema = Yup.object().shape({
  name: Yup.string()
    .min(1, "Слишком коротко")
    .max(50, "Слишком длинно")
    .required("Обязательное поле"),
  username: Yup.string()
    .min(3, "Минимум 3 символа")
    .max(30, "Слишком длинно")
    .required("Обязательное поле"),
  password: Yup.string().min(8, "Минимум 8 символов").required("Обязательное поле"),
  confirmPassword: Yup.string()
    .required("Обязательное поле")
    .oneOf([Yup.ref("password"), null], "Пароли не совпадают"),
});

function Register({ setUserWantsToLogin }) {
  const dispatch = useDispatch();
  const [cities, setCities] = useState([]);
  const [cityMode, setCityMode] = useState("pick"); // pick | custom

  useEffect(() => {
    fetch("/api/geo/cities", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setCities(data.data?.cities ?? []))
      .catch(() => {});
  }, []);

  // Register user
  const { reqFn, reqState } = useFetch(
    { url: "/user/register", method: "POST" },
    () => {
      dispatch(authActions.login());
    }
  );

  return (
    <div className="w-full max-w-[36rem] mx-auto px-4">
      <h1 className="text-cta-icon font-semibold text-[2.4rem] uppercase mb-[1rem] text-center">
        Бомбила
      </h1>
      <p className="text-secondary-text text-center mb-[2rem]">
        Заказ такси через чат. Выберите свой город — он понадобится для заказов.
      </p>
      <Formik
        initialValues={{
          name: "",
          username: "",
          password: "",
          confirmPassword: "",
          cityId: "",
          newCityName: "",
        }}
        validationSchema={schema}
        onSubmit={(values) => {
          const payload = {
            name: values.name,
            username: values.username,
            password: values.password,
            confirmPassword: values.confirmPassword,
            ...(cityMode === "pick" && values.cityId
              ? { cityId: values.cityId }
              : { newCityName: values.newCityName }),
          };
          reqFn(payload);
        }}
      >
        {({ errors, values, setFieldValue }) => (
          <Form className="flex flex-col gap-[1.5rem]" autoComplete="off">
            <FormField
              labelName="Имя"
              labelClassName={`bg-transparent group-focus-within:hidden ${
                values.name && "hidden"
              }`}
              name="name"
              required={true}
              value={values.name}
              error={errors.name}
            />

            <FormField
              labelName="Логин"
              labelClassName={`bg-transparent group-focus-within:hidden ${
                values.username && "hidden"
              }`}
              name="username"
              required={true}
              value={values.username}
              error={errors.username}
            />

            <FormField
              labelName="Пароль"
              labelClassName={`bg-transparent group-focus-within:hidden ${
                values.password && "hidden"
              }`}
              name="password"
              required={true}
              value={values.password}
              error={errors.password}
              fieldType="password"
            />

            <FormField
              labelName="Повторите пароль"
              labelClassName={`bg-transparent group-focus-within:hidden ${
                values.confirmPassword && "hidden"
              }`}
              name="confirmPassword"
              required={true}
              value={values.confirmPassword}
              error={errors.confirmPassword}
              fieldType="password"
            />

            <div className="flex gap-2 justify-center text-sm">
              <button
                type="button"
                className={`px-3 py-1 rounded ${
                  cityMode === "pick" ? "bg-accent text-black" : "bg-secondary text-secondary-text"
                }`}
                onClick={() => setCityMode("pick")}
              >
                Выбрать город
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded ${
                  cityMode === "custom" ? "bg-accent text-black" : "bg-secondary text-secondary-text"
                }`}
                onClick={() => setCityMode("custom")}
              >
                Моего города нет
              </button>
            </div>

            {cityMode === "pick" ? (
              <select
                className="w-full bg-secondary border border-secondary-text rounded-xl p-[1.2rem] text-primary-text text-[1.6rem]"
                name="cityId"
                value={values.cityId}
                onChange={(event) => setFieldValue("cityId", event.target.value)}
              >
                <option value="">Выберите город</option>
                {cities.map((city) => (
                  <option key={city._id} value={city._id}>
                    {city.name}
                  </option>
                ))}
              </select>
            ) : (
              <FormField
                labelName="Ваш город"
                labelClassName={`bg-transparent group-focus-within:hidden ${
                  values.newCityName && "hidden"
                }`}
                name="newCityName"
                value={values.newCityName}
                error={errors.newCityName}
              />
            )}

            <button
              className={`bg-cta-icon p-[1.2rem] rounded-xl uppercase text-black font-semibold flex items-center justify-center w-full ${
                reqState === "loading" ||
                (cityMode === "pick" ? !values.cityId : !values.newCityName)
                  ? "opacity-50"
                  : "opacity-100"
              }`}
              type="submit"
            >
              {reqState !== "loading" && "Создать аккаунт"}
              {reqState === "loading" && (
                <Spinner className="w-[2.5rem] h-[2.5rem]" />
              )}
            </button>
          </Form>
        )}
      </Formik>
      <div
        onClick={() => setUserWantsToLogin(true)}
        className="mt-[2rem] text-center text-secondary-text underline cursor-pointer hover:text-cta-icon"
      >
        Уже есть аккаунт
      </div>
    </div>
  );
}

export default Register;
