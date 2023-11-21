export type HexString = string
export type Nullable<T> = T | null
export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
