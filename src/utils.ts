import type { GLBuffer } from "./buffer"
import type { GLBindGroup } from "./group"

export const GL = WebGL2RenderingContext

export function notImplemented<T>(type: string): T {
    return expect("Implementation of " + type)
}

export function expect<T>(message: string): Exclude<T, null | undefined> {
    throw new Error("Expected but not satisfied: " + message)
}

export function origin3D(origin: GPUOrigin3D, defaults = [0, 0, 0] as const): [number, number, number] {
    const [x, y, z] = origin instanceof Array ? origin : [ origin.x, origin.y, origin.z ]
    const [dx, dy, dz] = defaults
    return [x ?? dx, y ?? dy, z ?? dz]
}

export function extent3D(extent: GPUExtent3DStrict, defaults = [1, 1, 1] as const): [number, number, number] {
    const [w, h, d] = "width" in extent ? [ extent.width, extent.height, extent.depthOrArrayLayers ] : extent 
    const [dw, dh, dd] = defaults
    return [w ?? dw, h ?? dh, d ?? dd]
}

export function color(c: GPUColor, defaults = [1, 1, 1, 1] as const): [number, number, number, number] {
    const [r, g, b, a] = c instanceof Array ? c  : [c.r, c.g, c.b, c.a]
    const [dr, dg, db, da] = defaults
    return [r ?? dr, g ?? dg, b ?? db, a ?? da];
}

export function compareFunction(compareFunction: GPUCompareFunction): number {
    switch (compareFunction) {
        case "always": return GL.ALWAYS
        case "equal": return GL.EQUAL
        case "greater": return GL.GREATER
        case "greater-equal": return GL.GEQUAL
        case "less": return GL.LESS
        case "less-equal": return GL.LEQUAL
        case "not-equal": return GL.NOTEQUAL
        case "never": return GL.NEVER
    }
}

export function extend<T>(array: SparseArray<T>, index: number) {
    const length = array.length
    if (index >= length) {
        array.length = index + 1
        array.fill(undefined, length)
    }
}

export function cast<T, F extends Function>(value: T, type: F): F["prototype"] {
    return value instanceof type ? value as F["prototype"] : expect("")
}

export function required<T, R>(value: T, mapper: (v: T) => R) {
    return mapper(value)
}

export function derivable<T, R>(value: T | undefined, mapper: (v: Partial<T>) => R) {
    return required(value ?? {}, mapper)
}

export function nullable<T, R>(value: T | null, mapper: (v: T) => R) {
    return value !== undefined && value !== null ? required(value, mapper) : null
}

export function optional<T, R>(value: T | undefined, mapper: (v: T) => R) {
    return value !== undefined && value !== null ? required(value, mapper) : undefined
}

export function alignTo(alignment: number, size: number) {
    return Math.ceil(size / alignment) * alignment
}

export type SparseArray<T> = (T | undefined)[]

export type GLIndexBufferBinding = {
    buffer: GLBuffer
    indexFormat: GPUIndexFormat
    offset: number
    size: number
}

export type GLBufferBinding = {
    buffer: GLBuffer
    offset: number
    size: number
}

export type GLGroupDynamicBinding = {
    bindGroup: GLBindGroup, 
    dynamicOffsetsData: Uint32Array | Iterable<GPUBufferDynamicOffset>, 
    dynamicOffsetsDataStart: number, 
    dynamicOffsetsDataLength: number
}

export type DeepRequired<T> = 
      T extends Tuple<infer H, infer T> ? DeepRequiredTuple<H, T>
    : T extends GPUObjectBase ? T
    : T extends Map<infer K, infer V> ? Map<K, DeepRequired<V>>
    : T extends Set<infer E> ? Set<DeepRequired<E>>
    : T extends (infer E)[] ? DeepRequired<E>[]
    : T extends Iterable<infer E> ? E extends Iterable<any> ? T : Iterable<DeepRequired<E>>
    : T extends object ? { [k in keyof T]-?: DeepRequired<T[k]> }
    : T

type DeepRequiredTuple<H, T extends (Tuple | [])> = T extends Tuple<infer HH, infer TT> 
    ? Tuple<DeepRequired<H>, DeepRequiredTuple<HH, TT>> 
    : Tuple<DeepRequired<H>, []> 

type Tuple<H = any, T extends (Tuple | []) = any> = [H, ...T]
