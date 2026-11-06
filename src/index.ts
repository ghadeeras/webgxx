import { GLWebGPU, UserAgentWebGPU, type WebGPU } from "./api.js"
import { GPUExtendedRealityContext } from "./context.js"
import { GLDevice } from "./device.js"
import { polyfill } from "./polyfill.js"

export type { WebGPU } from "./api.js"

polyfill()

/*
 * First try using the User Agent WebGPU implementation. If that does not work (i.e. if no GPU, GPUAdapter, GPUDevice, or GPUCanvasContext were obtainable) 
 * then fall back to the implementation supplied by the `glWebGPU()` function below
 */

export const userAgentWebGPU: WebGPU = new UserAgentWebGPU()

export function glWebGPU(canvas: HTMLCanvasElement): WebGPU {
    return new GLWebGPU(canvas)
}

export function xrCompatible(device: GPUDevice): boolean {
    return device instanceof GLDevice && device.adapter.options.xrCompatible
}

export async function xrContext(xrSession: XRSession, device: GPUDevice): Promise<GPUCanvasContext>{
    return await GPUExtendedRealityContext.create(xrSession, device)
}

export function glContext(device: GPUDevice): WebGL2RenderingContext | null {
    return device instanceof GLDevice ? device.context : null
}
