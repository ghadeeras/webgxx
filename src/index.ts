import { GLWebGPU, UserAgentWebGPU, type WebGPU } from "./api.js"
import { polyfill } from "./polyfill.js"

polyfill()

/*
 * First try using the User Agent WebGPU implementation. If that does not work (i.e. if no GPU, GPUAdapter, GPUDevice, or GPUCanvasContext were obtainable) 
 * then fall back to the implementation supplied by the `glWebGPU()` function below
 */

export const userAgentWebGPU: WebGPU = new UserAgentWebGPU()

export function glWebGPU(canvas: HTMLCanvasElement): WebGPU {
    return new GLWebGPU(canvas)
}
