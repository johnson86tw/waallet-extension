type ButtonProps = {
  buttonText: string
  disabled: boolean
  onClick: () => void
  variant: "black" | "white"
  className?: string
}
export const Button = (props: ButtonProps) => {
  const { buttonText, disabled, onClick, variant, className } = props
  const baseClass =
    "font-bold border border-solid border-black p-[16px] rounded-full w-full"
  const variantClass =
    variant === "black"
      ? "bg-black text-white hover:text-[#989898]"
      : "bg-white text-black"
  const disabledClass = "bg-[#BBBBBB] text-white border-none"
  return (
    <button
      className={`${baseClass} ${
        disabled ? disabledClass : variantClass
      } ${className}`}
      disabled={disabled}
      onClick={onClick}>
      {buttonText}
    </button>
  )
}
