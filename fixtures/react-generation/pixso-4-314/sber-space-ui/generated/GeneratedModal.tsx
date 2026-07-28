import { Stack, Typography } from "@sber-space-ui/atom";
import { Autocomplete } from "@sber-space-ui/autocomplete";
import { Button } from "@sber-space-ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@sber-space-ui/modal";
import styles from "./GeneratedModal.module.css";
export interface GeneratedModalProps {
    onPrimaryAction?: () => void;
    onSecondaryAction?: () => void;
}
export function GeneratedModal({ onPrimaryAction, onSecondaryAction }: GeneratedModalProps) {
    return (<Modal><ModalHeader><Typography className={styles["ui_heading_4-315"]}>{"\u041F\u0435\u0440\u0435\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F"}</Typography></ModalHeader><ModalBody><div className={styles["ui_combobox_4-316"]}><Autocomplete mode="dropdown" onChange={() => undefined} options={[]} value=""/></div></ModalBody><ModalFooter><Stack className={styles["ui_actionGroup_4-317"]}><Button className={styles["ui_secondaryAction_4-555-4-460"]} onClick={onSecondaryAction}>{"\u041E\u0442\u043C\u0435\u043D\u0430"}</Button><Button className={styles["ui_primaryAction_4-597-4-461"]} onClick={onPrimaryAction}>{"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438 \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u0442\u044C"}</Button></Stack></ModalFooter></Modal>);
}
