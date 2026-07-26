import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import styles from "./GeneratedModal.module.css";
export interface GeneratedModalProps {
    onCancel?: () => void;
    onSubmit?: () => void;
}
export function GeneratedModal({ onCancel, onSubmit }: GeneratedModalProps) {
    return (<Dialog><DialogTitle><Typography className={styles["ui_heading"]}>{"\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u044F\u0432\u043A\u0443"}</Typography></DialogTitle><DialogContent><Stack className={styles["ui_content"]}><Typography className={styles["ui_body_copy"]}>{"\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438"}</Typography></Stack><TextField className={styles["ui_text_input"]} label="Название заявки" placeholder="Введите название"/></DialogContent><DialogActions><Stack className={styles["ui_actions"]}><Button className={styles["ui_cancel"]} onClick={onCancel}>{"\u041E\u0442\u043C\u0435\u043D\u0430"}</Button><Button className={styles["ui_submit"]} onClick={onSubmit}>{"\u0421\u043E\u0437\u0434\u0430\u0442\u044C"}</Button></Stack></DialogActions></Dialog>);
}
