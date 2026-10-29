import { GLAdapter } from "./adpater.js"

export class GLGPU implements GPU {
    
    constructor(readonly canvas: HTMLCanvasElement) {}

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPU"
    
    readonly wgslLanguageFeatures: WGSLLanguageFeatures = new Set()

    getPreferredCanvasFormat(): GPUTextureFormat {
        return "rgba8unorm"
    }
    
    async requestAdapter(options: GPURequestAdapterOptions = {}): Promise<GPUAdapter | null> {
        return GLAdapter.create(this, options)
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}
