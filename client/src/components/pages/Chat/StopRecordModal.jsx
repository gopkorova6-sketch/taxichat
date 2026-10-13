import React from "react";
import { useDispatch } from "react-redux";
import { modalActions } from "../../../store/modalSlice";
import Modal from "../../globals/Modal";

function StopRecordModal({ playRecording, clearRecording }) {
  const dispatch = useDispatch();

  return (
    <Modal
      onClick={() => dispatch(modalActions.closeModal())}
      typeValue="stopRecordModal"
      className="w-[30rem] !px-[2rem] pb-[2rem]"
      canOverlayClose={false}
    >
      <h2 className="font-semibold text-[2rem]">Отменить голосовое сообщение</h2>
      <p className="">
        Вы уверены, что хотите остановить запись и отменить голосовое сообщение
      </p>
      <div className="flex items-center justify-center gap-[2rem] mt-[1rem]">
        <button
          onClick={playRecording}
          className="text-cta-icon rounded-md font-semibold uppercase p-[1rem] hover:bg-secondary-light-text"
        >
          Продолжить
        </button>
        <button
          onClick={clearRecording}
          className="text-danger rounded-md font-semibold uppercase p-[1rem] hover:bg-secondary-light-text"
        >
          Отменить
        </button>
      </div>
    </Modal>
  );
}

export default StopRecordModal;
