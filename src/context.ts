import { GLDevice } from "./device.js"
import { GLTexture } from "./texture.js"
import { cast, expect } from "./utils.js"

abstract class GLCanvasContextBase implements GPUCanvasContext {

    private configuration: GPUCanvasConfigurationOut | null = null
    private texture: GLTexture | null = null

    abstract width: number
    abstract height: number
    abstract framebuffer: WebGLFramebuffer | null

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUCanvasContext"

    abstract canvas: HTMLCanvasElement | OffscreenCanvas

    configure(configuration: GPUCanvasConfiguration): undefined {
        if (!(configuration.device instanceof GLDevice)) {
            throw new Error("Incompatible device!")
        }
        if (configuration.device.adapter.gpu.canvas !== this.canvas) {
            throw new Error("Incompatible canvas!")
        }
        this.configuration = {
            device: configuration.device,
            format: configuration.format,
            viewFormats: configuration.viewFormats ?? [configuration.format],
            alphaMode: configuration.alphaMode ?? "opaque",
            colorSpace: configuration.colorSpace ?? "srgb",
            usage: configuration.usage ?? GPUTextureUsage.RENDER_ATTACHMENT,
            toneMapping: configuration.toneMapping ?? { mode: "standard" },
        }
    }

    getConfiguration(): GPUCanvasConfigurationOut | null {
        return this.configuration
    }

    getCurrentTexture(): GPUTexture {
        if (this.texture !== null && this.texture.width === this.width && this.texture.height === this.height) {
            return this.texture
        } else if (this.texture !== null) {
            this.texture.destroy()
            this.texture = null
        }
        if (this.configuration === null) {
            return expect("Configured context")
        }
        const device = cast(this.configuration.device, GLDevice)
        const texture = cast(device.createTexture({
            format: this.configuration.format,
            size: [this.width, this.height],
            usage: this.configuration.usage,
        }), GLTexture)
        texture.onDoneRendering = (t, viewport) => {
            const [x, y, w, h] = viewport
            t.blit([x, y], this.framebuffer, [x, y], [w, h])
        }
        return this.texture = texture
    }

    unconfigure(): undefined {
        this.configuration = null
        this.texture = null
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

export class GLCanvasContext extends GLCanvasContextBase {

    constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
        super()
    }

    readonly framebuffer: WebGLFramebuffer | null = null

    get width(): number {
        return this.canvas.width
    }

    get height(): number {
        return this.canvas.height
    }

}

export class GPUExtendedRealityContext extends GLCanvasContextBase {

    private constructor(readonly baseLayer: XRWebGLLayer, readonly device: GLDevice) {
        super()
    }

    static async create(xrSession: XRSession, device: GPUDevice) {
        const glDevice = cast(device, GLDevice)
        const baseLayer = new XRWebGLLayer(xrSession, glDevice.context, {
            antialias: false,
            depth: false,
            ignoreDepthValues: true,
        })
        await xrSession.updateRenderState({ baseLayer })
        return new GPUExtendedRealityContext(baseLayer, glDevice)
    }

    get canvas() {
        return this.device.adapter.gpu.canvas
    }

    get framebuffer(): WebGLFramebuffer | null {
        return this.baseLayer.framebuffer
    }

    get width(): number {
        return this.baseLayer.framebufferWidth
    }

    get height(): number {
        return this.baseLayer.framebufferHeight
    }

}
