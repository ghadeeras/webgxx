import { GLDevice } from "./device.js"
import { GLTexture } from "./texture.js"
import { cast, expect } from "./utils.js"

export class GLCanvasContext implements GPUCanvasContext {

    private configuration: GPUCanvasConfigurationOut | null = null
    private texture: GLTexture | null = null

    constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
        this.canvas = canvas
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUCanvasContext"

    readonly canvas: HTMLCanvasElement | OffscreenCanvas

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
        if (this.texture !== null && this.texture.width === this.canvas.width && this.texture.height === this.canvas.height) {
            return this.texture
        } else if (this.texture !== null) {
            this.texture.destroy()
            this.texture = null
        }
        if (this.configuration === null) {
            return expect("Configured canvas")
        }
        const device = cast(this.configuration.device, GLDevice)
        const texture = cast(device.createTexture({
            format: this.configuration.format,
            size: [this.canvas.width, this.canvas.height],
            usage: this.configuration.usage,
        }), GLTexture)
        texture.onDoneRendering = (t, viewport) => {
            const [x, y, w, h] = viewport
            t.blit([x, y], null, [x, y], [w, h])
        }
        return this.texture = texture
    }

    unconfigure(): undefined {
        this.configuration = null
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}
