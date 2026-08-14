import { Stack, Typography } from "@sber-space-ui/atom";
import { Button } from "@sber-space-ui/button";
import { Field } from "@sber-space-ui/field";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@sber-space-ui/modal";
import styles from "./GeneratedModal.module.css";
export interface GeneratedModalProps {
    onCancel?: () => void;
    onSubmit?: () => void;
}
export function GeneratedModal({ onCancel, onSubmit }: GeneratedModalProps) {
    return (<Modal><ModalHeader><Typography className={styles["ui_heading"]}>{"Создать заявку"}</Typography></ModalHeader><ModalBody><Stack className={styles["ui_content"]}><Typography className={styles["ui_body_copy"]}>{"Заполните данные заявки"}</Typography></Stack><div className={styles["ui_text_input"]}><Field placeholder="Введите название" value=""/></div></ModalBody><ModalFooter><Stack className={styles["ui_actions"]}><Button className={styles["ui_cancel"]} onClick={onCancel}>{"Отмена"}</Button><Button className={styles["ui_submit"]} onClick={onSubmit}>{"Создать"}</Button></Stack></ModalFooter></Modal>);
}
