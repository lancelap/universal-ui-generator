import { Stack, Typography } from "@sber-space-ui/atom";
import { Autocomplete } from "@sber-space-ui/autocomplete";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@sber-space-ui/modal";
import styles from "./GeneratedModal.module.css";
export interface GeneratedModalProps {
}
export function GeneratedModal({}: GeneratedModalProps) {
    return (<Modal><ModalHeader><Typography className={styles["ui_heading_4-315"]}>{"\u041F\u0435\u0440\u0435\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F"}</Typography></ModalHeader><ModalBody><div className={styles["ui_combobox_4-316"]}><Autocomplete mode="dropdown" onChange={() => undefined} options={[]} value=""/></div></ModalBody><ModalFooter><Stack className={styles["ui_actionGroup_4-317"]}/></ModalFooter></Modal>);
}
