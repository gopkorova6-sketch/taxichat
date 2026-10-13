import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { modalActions } from "../../store/modalSlice";
import Modal from "./Modal";
import useFetch from "../../hooks/useFetch";
import { chatActions } from "../../store/chatSlice";
import useSocket from "../../hooks/useSocket";

function DeleteChat() {
  const dispatch = useDispatch();
  const chatData = useSelector((state) => state.modalReducer.payload.chatData);
  const { socketEmit } = useSocket();

  const deleteChatRoom = () => {
    socketEmit("user:chatRoomClear", {
      chatRoomId: chatData?.chatRoomId || chatData?._id,
    });
    dispatch(chatActions.setChatUnactive());
  };

  return (
    <Modal
      onClick={() => dispatch(modalActions.closeModal())}
      typeValue="deleteChatModal"
      className="w-[30rem] !px-[2rem] pb-[2rem]"
      canOverlayClose={true}
    >
      <h2 className="font-semibold text-[2rem]">Удалить чат</h2>
      <p className="">
        Вы уверены, что хотите удалить чат с{" "}
        {chatData?.profile?.name || chatData?.chatProfile?.username}
      </p>
      <div className="flex items-center justify-center gap-[2rem] mt-[1rem]">
        <button className="text-cta-icon rounded-md font-semibold uppercase p-[1rem] hover:bg-secondary-light-text">
          Отмена
        </button>
        <button
          onClick={() => {
            deleteChatRoom();
          }}
          className="text-danger rounded-md font-semibold uppercase p-[1rem] hover:bg-secondary-light-text"
        >
          Удалить
        </button>
      </div>
    </Modal>
  );
}

export default DeleteChat;
