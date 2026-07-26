import { Stack, Typography } from "@sber-space-ui/atom";
import { Button } from "@sber-space-ui/button";
import { Field } from "@sber-space-ui/field";
import { FormControl, FormLabel } from "@sber-space-ui/form-control";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@sber-space-ui/modal";
import styles from "./GeneratedModal.module.css";
export interface GeneratedModalProps {
    onCancel?: () => void;
    onSubmit?: () => void;
}
export function GeneratedModal({ onCancel, onSubmit }: GeneratedModalProps) {
    return (<Modal><ModalHeader><Typography className={styles["ui_heading"]}>{"\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"}</Typography></ModalHeader><ModalBody><Stack className={styles["ui_content"]}><Typography className={styles["ui_body_copy"]}>{"\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"}</Typography></Stack><div className={styles["ui_text_input"]}><Field placeholder="Введите название" value=""><FormControl /><FormLabel /></Field></div></ModalBody><ModalFooter><Stack className={styles["ui_actions"]}><Button className={styles["ui_cancel"]} onClick={onCancel}>{"\u041E\u0442\u043C\u0435\u043D\u0430"}</Button><Button className={styles["ui_submit"]} onClick={onSubmit}>{"\u0421\u043E\u0437\u0434\u0430\u0442\u044C"}</Button></Stack></ModalFooter></Modal>);
}
