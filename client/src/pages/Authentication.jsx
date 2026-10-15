import React from "react";
import { useState } from "react";
import Login from "../components/pages/Authentication/Login";
import Register from "../components/pages/Authentication/Register";

function Authentication() {
  const [userWantToLogin, setUserWantsToLogin] = useState(true);

  return (
    <div className="w-full h-full flex items-center justify-center px-[1rem] py-6 overflow-y-auto">
      {userWantToLogin && <Login setUserWantsToLogin={setUserWantsToLogin} />}

      {!userWantToLogin && (
        <Register setUserWantsToLogin={setUserWantsToLogin} />
      )}
    </div>
  );
}

export default Authentication;
