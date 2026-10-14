import React from "react";
import * as Yup from "yup";
import { Formik, Form } from "formik";
import FormField from "../../globals/FormField";
import useFetch from "../../../hooks/useFetch";
import { useDispatch } from "react-redux";
import { authActions } from "../../../store/authSlice";
import Spinner from "../../globals/Spinner";

const schema = Yup.object().shape({
  username: Yup.string().required("Обязательное поле"),
  password: Yup.string().required("Обязательное поле"),
});

function Login({ setUserWantsToLogin }) {
  const dispatch = useDispatch();
  // Request to log user in
  const { reqState, reqFn: loginRequest } = useFetch(
    { url: "/user/login", method: "POST" },
    // Success
    () => {
      dispatch(authActions.login());
    }
  );

  return (
    <div className="w-full max-w-[36rem] mx-auto px-4">
      <h1 className="text-cta-icon font-semibold text-[2.4rem] uppercase mb-[2rem]">
        Бомбила
      </h1>
      <Formik
        initialValues={{
          username: "",
          password: "",
        }}
        validationSchema={schema}
        onSubmit={loginRequest}
      >
        {({ errors, values }) => (
          <Form className="flex flex-col gap-[1.5rem]" autoComplete="off">
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
              className={`bg-cta-icon mt-[1rem] p-[1rem] rounded-xl uppercase text-black font-semibold opacity-80 flex items-center justify-center ${
                !errors.username && !errors.password && "opacity-100"
              }`}
              type="submit"
            >
              {reqState !== "loading" && "Войти"}
              {reqState === "loading" && (
                <Spinner className="w-[2.5rem] h-[2.5rem]" />
              )}
            </button>
          </Form>
        )}
      </Formik>
      <div
        onClick={() => setUserWantsToLogin(false)}
        className="mt-[2rem] text-center text-secondary-text underline cursor-pointer hover:text-cta-icon"
      >
        Ещё не с нами?
      </div>
    </div>
  );
}

export default Login;
