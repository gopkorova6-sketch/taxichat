import React from "react";
import * as Yup from "yup";
import { Formik, Form } from "formik";
import FormField from "../../globals/FormField";
import useFetch from "../../../hooks/useFetch";
import { useDispatch } from "react-redux";
import { authActions } from "../../../store/authSlice";
import { reconnectSocket } from "../../../hooks/useSocket";
import Spinner from "../../globals/Spinner";

const schema = Yup.object().shape({
  username: Yup.string().required("Обязательное поле"),
  password: Yup.string().required("Обязательное поле"),
});

function Login({ setUserWantsToLogin }) {
  const dispatch = useDispatch();
  const { reqState, reqFn: loginRequest } = useFetch(
    { url: "/user/login", method: "POST" },
    () => {
      dispatch(authActions.login());
      // The socket must reconnect with the fresh auth cookie to join city rooms
      reconnectSocket();
    }
  );

  return (
    <div className="w-full max-w-[34rem] mx-auto px-4 anim-rise">
      <div className="flex flex-col items-center gap-1 mb-6">
        <span className="brand-title brand-gradient">Бомбила</span>
        <span className="text-[1.2rem] text-secondary-text tracking-wide">такси без посредников</span>
      </div>

      <div className="glass-strong rounded-3xl p-5 space-y-4">
        <div className="text-center font-display font-bold text-[1.6rem]">🚕 Вход</div>

        <Formik
          initialValues={{ username: "", password: "" }}
          validationSchema={schema}
          onSubmit={loginRequest}
        >
          {({ errors, values }) => (
            <Form className="flex flex-col gap-[1.4rem]" autoComplete="off">
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

              <button
                className={`press btn-accent mt-[0.5rem] p-[1.2rem] rounded-2xl font-display font-extrabold text-[1.5rem] w-full flex items-center justify-center tracking-wide ${
                  errors.username || errors.password ? "opacity-60" : ""
                }`}
                type="submit"
              >
                {reqState !== "loading" && "🚪 Войти"}
                {reqState === "loading" && (
                  <Spinner className="w-[2.5rem] h-[2.5rem]" />
                )}
              </button>
            </Form>
          )}
        </Formik>
      </div>

      <button
        onClick={() => setUserWantsToLogin(false)}
        className="mt-[2rem] w-full text-center text-secondary-text underline hover:text-cta-icon text-[1.4rem]"
      >
        Ещё не с нами? Зарегистрироваться
      </button>
    </div>
  );
}

export default Login;