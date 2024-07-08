import ArrowLeft from "react:~assets/arrowLeft.svg"
import { Link } from "wouter"

import { Path } from "~app/path"

type HeaderProps = {
  title: string
  children?: React.ReactNode
  href: Path
}
export const Header = (props: HeaderProps) => {
  const { title, children, href } = props
  return (
    <div className="flex flex-col gap-[16px]">
      <Link href={href}>
        <ArrowLeft />
      </Link>

      <h1 className="text-[24px]">{title}</h1>
      {children}
      <div className="relative w-full">
        <hr className="divider" />
      </div>
    </div>
  )
}
