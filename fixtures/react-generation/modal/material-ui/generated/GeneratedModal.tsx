import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import styles from "./GeneratedModal.module.css";
export interface GeneratedModalProps {
    onCancel?: () => void;
    onSubmit?: () => void;
}
export function GeneratedModal({ onCancel, onSubmit }: GeneratedModalProps) {
    return (<Dialog><DialogTitle><Typography className={styles["ui_heading"]}>{"Создать заявку"}</Typography></DialogTitle><DialogContent><Stack className={styles["ui_content"]}><Typography className={styles["ui_body_copy"]}>{"Заполните данные заявки"}</Typography></Stack><TextField className={styles["ui_text_input"]} label="Название заявки" placeholder="Введите название" value=""/></DialogContent><DialogActions><Stack className={styles["ui_actions"]}><Button className={styles["ui_cancel"]} onClick={onCancel}>{"Отмена"}</Button><Button className={styles["ui_submit"]} onClick={onSubmit}>{"Создать"}</Button></Stack></DialogActions></Dialog>);
}
