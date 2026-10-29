import { GLCanvasContext } from "./canvas.js"
import { GLGPU } from "./gpu.js"

/**
 * This interface represents the entire WebGPU API.
 * 
 * By depending on this interface instead of the API access points that the user agent provides, it becomes easier to replace the implementation as needed. 
 */
export interface WebGPU {
    readonly gpu: GPU
    context(canvas: HTMLCanvasElement): GPUCanvasContext | null
}

/**
 * The WebGPU implementation as provided by the User Agent.
 */
export class UserAgentWebGPU implements WebGPU {
    
    get gpu(): GPU {
        return navigator.gpu
    }

    context(canvas: HTMLCanvasElement): GPUCanvasContext | null {
        return canvas.getContext("webgpu")
    }

}

/**
 * A partial WebGPU implementation based on WebGL2.
 * 
 * Please note that this implementation still requires GLSL to be the shading language, instead of WGSL.
 */
export class GLWebGPU implements WebGPU {
    
    private _context: GPUCanvasContext | null = null
    
    constructor(private canvas: HTMLCanvasElement) {
    }
    
    get gpu(): GPU {
        return new GLGPU(this.canvas)
    }
    
    context(canvas: HTMLCanvasElement): GPUCanvasContext | null {
        return canvas === this.canvas 
            ? this._context ?? (this._context = new GLCanvasContext(canvas))
            : new GLCanvasContext(canvas)
    }

}
