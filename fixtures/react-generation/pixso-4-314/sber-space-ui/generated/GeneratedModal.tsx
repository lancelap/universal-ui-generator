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
    return (<Modal><ModalHeader><Typography className={styles["ui_heading_4-315"]}>{"Переформирование поручения"}</Typography></ModalHeader><ModalBody><div className={styles["ui_combobox_4-316"]}><Autocomplete mode="dropdown" onChange={() => undefined} options={[]} value=""/></div></ModalBody><ModalFooter><Stack className={styles["ui_actionGroup_4-317"]}><Button className={styles["ui_secondaryAction_4-555-4-460"]} onClick={onSecondaryAction}>{"Отмена"}</Button><Button className={styles["ui_primaryAction_4-597-4-461"]} onClick={onPrimaryAction}>{"Подтвердить и закончить"}</Button></Stack></ModalFooter></Modal>);
}
