const fs = require("fs");

const edits = {
  "client/src/components/pages/Authentication/Login.jsx": [
    ['required("Field is required")', 'required("Обязательное поле")'],
    ['labelName="Username"', 'labelName="Логин"'],
    ['labelName="Password"', 'labelName="Пароль"'],
    ['&& "Login"}', '&& "Войти"}'],
  ],
  "client/src/components/pages/Authentication/Register.jsx": [
    ['required("Field is required")', 'required("Обязательное поле")'],
    ['"Passwords must match"', '"Пароли не совпадают"'],
    ['labelName="Name"', 'labelName="Имя"'],
    ['labelName="Username"', 'labelName="Логин"'],
    ['labelName="Password"', 'labelName="Пароль"'],
    ['&& "Join"}', '&& "Создать аккаунт"}'],
  ],
  "client/src/hooks/useUpload.jsx": [
    ['message: "File too large"', 'message: "Файл слишком большой"'],
    ["message: `Only ${errorMessage} allowed`", "message: `Разрешены только: ${errorMessage}`"],
  ],
  "client/src/components/pages/SelectContacts.jsx": [
    ['placeholder="Who would you like to add?"', 'placeholder="Кого хотите добавить?"'],
  ],
  "client/src/components/globals/NewContactForm.jsx": [
    ['labelName="Name"', 'labelName="Имя"'],
    ['labelName="Username"', 'labelName="Логин"'],
  ],
};

for (const [path, pairs] of Object.entries(edits)) {
  let src = fs.readFileSync(path, "utf8");
  for (const [from, to] of pairs) {
    src = src.split(from).join(to);
  }
  fs.writeFileSync(path, src);
  console.log("done", path);
}
