import { useEffect } from "react"
import {
  navigate,
  useLocationProperty,
  type BaseLocationHook
} from "wouter/use-location"

// Returns the current hash location in a normalized form
// (excluding the leading '#' symbol)
export const useHashLocation: BaseLocationHook = () => {
  const hashLocation = () => window.location.hash.replace(/^#/, "") || "/"

  const hashNavigate = (to: string) => {
    return navigate("#" + to)
  }

  const location = useLocationProperty<string>(hashLocation)

  return [location, hashNavigate]
}
