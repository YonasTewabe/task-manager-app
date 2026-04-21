import * as Dialog from "@radix-ui/react-dialog";

export default function Modal({
  open,
  onOpenChange,
  children,
  cardClassName = "",
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal-card ${cardClassName}`.trim()}>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
