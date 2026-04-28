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
        <Dialog.Overlay className="fixed inset-0 z-40 grid place-items-center bg-[rgba(9,30,66,0.36)] p-2 backdrop-blur-[3px] min-[640px]:p-4" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-[41] grid max-h-[calc(100vh-1rem)] w-[min(640px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 gap-[0.92rem] overflow-auto overflow-x-hidden rounded-[16px] border border-[#d6e0ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-[0.9rem] shadow-[0_22px_48px_rgba(9,30,66,0.24)] transition-[border-color,box-shadow,transform] duration-150 ease-out min-[640px]:max-h-[calc(100vh-2rem)] min-[640px]:p-[1.05rem] [&_.flex.items-center.justify-between]:m-[-0.2rem_-0.2rem_0] [&_.flex.items-center.justify-between]:border-b [&_.flex.items-center.justify-between]:border-[#e1e7f1] [&_.flex.items-center.justify-between]:px-[0.2rem] [&_.flex.items-center.justify-between]:pb-[0.82rem] [&_h3]:m-0 [&_h3]:text-[1.06rem] [&_h3]:font-bold [&_h3]:text-[#1f3657] [&_label]:grid [&_label]:gap-[0.38rem] [&_label]:text-[0.95rem] [&_label]:text-[#253858] [&_input]:w-full [&_select]:w-full [&_textarea]:w-full [&_input]:rounded-[10px] [&_select]:rounded-[10px] [&_textarea]:rounded-[10px] [&_input]:border [&_select]:border [&_textarea]:border [&_input]:border-[#c8d5ea] [&_select]:border-[#c8d5ea] [&_textarea]:border-[#c8d5ea] [&_input]:bg-white [&_select]:bg-white [&_textarea]:bg-white [&_input]:px-[0.66rem] [&_select]:px-[0.66rem] [&_textarea]:px-[0.66rem] [&_input]:py-[0.52rem] [&_select]:py-[0.52rem] [&_textarea]:py-[0.52rem] [&_input]:text-[#172b4d] [&_select]:text-[#172b4d] [&_textarea]:text-[#172b4d] [&_input]:outline-none [&_select]:outline-none [&_textarea]:outline-none [&_input:focus]:border-[#7ea4e8] [&_select:focus]:border-[#7ea4e8] [&_textarea:focus]:border-[#7ea4e8] [&_input:focus]:shadow-[0_0_0_3px_rgba(45,100,217,0.16)] [&_select:focus]:shadow-[0_0_0_3px_rgba(45,100,217,0.16)] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(45,100,217,0.16)] ${cardClassName}`.trim()}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
