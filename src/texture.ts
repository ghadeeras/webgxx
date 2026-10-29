import type { GLDevice } from "./device.js"
import { expect, extent3D, GL, origin3D, type DeepRequired } from "./utils.js"

export abstract class GLTexture<T extends WebGLTexture | WebGLRenderbuffer = any> implements GPUTexture {

    private srcFramebuffer = this.device.context.createFramebuffer()
    private dstFramebuffer = this.device.context.createFramebuffer()
    protected internalFormat: GLenum = textureFormat(this.descriptor.format)
    
    protected constructor(readonly device: GLDevice, readonly descriptor: DeepRequired<DefaultedGPUTextureDescriptor>, readonly wrapped: T, readonly target: GLenum) {
        [this.width, this.height, this.depthOrArrayLayers] = descriptor.size
        this.whileBound(() => this.allocate())
    }

    static create(device: GLDevice, descriptor: GPUTextureDescriptor): GLTexture {
        const defaultedDescriptor = descriptorWithDefaults(descriptor)
        const target = textureTarget(defaultedDescriptor.textureBindingViewDimension, defaultedDescriptor.sampleCount)
        switch (target) {
            case GL.RENDERBUFFER    : return new GLRenderBuffer(device, defaultedDescriptor)
            case GL.TEXTURE_2D      : return new GLTexture2D(device, defaultedDescriptor)
            case GL.TEXTURE_CUBE_MAP: return new GLTextureCubeMap(device, defaultedDescriptor)
            case GL.TEXTURE_3D      : return new GLTexture3D(device, defaultedDescriptor)
            case GL.TEXTURE_2D_ARRAY: return new GLTexture2DArray(device, defaultedDescriptor)
            default: return expect("Supported texture target")
        }
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUTexture"

    readonly label: string = this.descriptor.label

    readonly width: number

    readonly height: number

    readonly depthOrArrayLayers: number

    readonly dimension: GPUTextureDimension = this.descriptor.dimension

    readonly format: GPUTextureFormat = this.descriptor.format

    readonly mipLevelCount: number = this.descriptor.mipLevelCount

    readonly sampleCount: number = this.descriptor.sampleCount

    readonly usage: number = this.descriptor.usage

    createView(descriptor: GPUTextureViewDescriptor = {}): GPUTextureView {
        return GLTextureView.create(this, descriptor)
    }

    abstract destroy(): undefined

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
    onDoneRendering: (texture: GLTexture<T>, viewport: [number, number, number, number]) => void = () => {}

    doneRendering(viewport: [number, number, number, number]): void {
        this.onDoneRendering(this, viewport)
    }

    whileBound(logic: () => void) {
        this.bind(this.wrapped)
        try {
            logic()
        } finally {
            this.bind(null)
        }
    }

    attach(target: GLenum, attachment: GLenum, level: GLint, layer: number) {
        this.attachTo(target, attachment, level, this.wrapped, layer)
    }

    detach(target: GLenum, attachment: GLenum, level: GLint, layer: number) {
        this.attachTo(target, attachment, level, null, layer)
    }

    asSource(level: number, layer: number, logic: () => void) {
        const gl = this.device.context
        this.bind(this.wrapped)
        gl.bindFramebuffer(GL.READ_FRAMEBUFFER, this.srcFramebuffer)
        this.attach(GL.READ_FRAMEBUFFER, GL.COLOR_ATTACHMENT0, level, layer)
        try {
            logic()
        } finally {
            gl.bindFramebuffer(GL.READ_FRAMEBUFFER, null)
            this.bind(null)
        }
    }

    asDestination(level: number, layer: number, logic: () => void) {
        const gl = this.device.context
        this.bind(this.wrapped)
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.dstFramebuffer)
        this.attach(GL.DRAW_FRAMEBUFFER, GL.COLOR_ATTACHMENT0, level, layer)
        try {
            logic()
        } finally {
            gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, null)
            this.bind(null)
        }
    }

    blit(from: [number, number], target: GLTexture<T> | null, to: [number, number], size: [number, number]): void {
        const gl = this.device.context
        const blit = () => gl.blitFramebuffer(
            from[0], from[1], from[0] + size[0], from[1] + size[1],
            to[0], to[1], to[0] + size[0], to[1] + size[1],
            GL.COLOR_BUFFER_BIT, GL.NEAREST
        )
        this.asSource(0, 0, () => {
            if (target != null) {
                target.asDestination(0, 0, blit)
            } else {
                gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, null)
                blit()
            }
        })
    }

    copyExternalImageToTexture(source: GPUCopyExternalImageSourceInfo, destination: GPUCopyExternalImageDestInfo, copySize: GPUExtent3DStrict): undefined {
        this.whileBound(() => {
            const origin = destination.origin ?? {}
            const [x, y] = origin3D(origin)
            const [w, h] = extent3D(copySize)
            const gl = this.device.context
            gl.texSubImage2D(
                this.target, 
                destination.mipLevel ?? 0, 
                x, y, w, h, 
                GL.RGBA, 
                GL.UNSIGNED_BYTE, 
                source.source
            )
            gl.generateMipmap(this.target);
        })
    }
    
    writeTexture(destination: GPUTexelCopyTextureInfo, data: GPUAllowSharedBufferSource, dataLayout: GPUTexelCopyBufferLayout, size: GPUExtent3DStrict): undefined {
        this.whileBound(() => {
            const origin = destination.origin ?? {}
            const [x, y] = origin3D(origin)
            const [w, h] = extent3D(size)
            const gl = this.device.context
            gl.texSubImage2D(
                this.target, 
                destination.mipLevel ?? 0, 
                x, y, w, h, 
                GL.RGBA, 
                GL.UNSIGNED_BYTE, 
                "slice" in data ? new Uint8Array(data) : data
            )
            gl.generateMipmap(this.target);
        })
    }

    protected abstract allocate(): void

    protected abstract bind(object: T | null): void;

    protected abstract attachTo(target: GLenum, attachment: GLenum, level: GLint, wrapped: T | null, layer: number): void;

}

class GLRenderBuffer extends GLTexture<WebGLRenderbuffer> {

    constructor(device: GLDevice, descriptor: DeepRequired<DefaultedGPUTextureDescriptor>) {
        super(device, descriptor, device.context.createRenderbuffer(), GL.RENDERBUFFER)
    }

    destroy(): undefined {
        this.device.context.deleteRenderbuffer(this.wrapped)
    }

    protected allocate(): void {
        this.device.context.renderbufferStorageMultisample(this.target, this.sampleCount, this.internalFormat, this.width, this.height)
    }

    protected bind(object: WebGLRenderbuffer | null): void {
        this.device.context.bindRenderbuffer(this.target, this.wrapped)
    }

    protected attachTo(target: GLenum, attachment: GLenum, level: GLint, wrapped: WebGLRenderbuffer | null, layer: number): void {
        this.device.context.framebufferRenderbuffer(target, attachment, this.target, wrapped)
    }

}

abstract class GLTextureND extends GLTexture<WebGLTexture> {

    constructor(device: GLDevice, descriptor: DeepRequired<DefaultedGPUTextureDescriptor>, target: GLenum) {
        super(device, descriptor, device.context.createTexture(), target)
    }

    destroy(): undefined {
        this.device.context.deleteTexture(this.wrapped)
    }

    protected bind(object: WebGLTexture | null): void {
        this.device.context.bindTexture(this.target, this.wrapped)
    }

}

export class GLTexture2D extends GLTextureND {

    constructor(device: GLDevice, descriptor: DeepRequired<DefaultedGPUTextureDescriptor>) {
        super(device, descriptor, GL.TEXTURE_2D)
    }

    protected allocate(): void {
        this.device.context.texStorage2D(this.target, this.mipLevelCount, this.internalFormat, this.width, this.height)
    }

    protected attachTo(target: GLenum, attachment: GLenum, level: GLint, wrapped: WebGLTexture | null, layer: number): void {
        this.device.context.framebufferTexture2D(target, attachment, this.target, wrapped, level)
    }

}

class GLTextureCubeMap extends GLTextureND {

    constructor(device: GLDevice, descriptor: DeepRequired<DefaultedGPUTextureDescriptor>) {
        super(device, descriptor, GL.TEXTURE_CUBE_MAP)
    }

    protected allocate(): void {
        this.device.context.texStorage2D(this.target, this.mipLevelCount, this.internalFormat, this.width, this.height)
    }

    protected attachTo(target: GLenum, attachment: GLenum, level: GLint, wrapped: WebGLTexture | null, layer: number): void {
        this.device.context.framebufferTexture2D(target, attachment, this.target, wrapped, level)
    }

}

class GLTexture3D extends GLTextureND {

    constructor(device: GLDevice, descriptor: DeepRequired<DefaultedGPUTextureDescriptor>) {
        super(device, descriptor, GL.TEXTURE_3D)
    }

    protected allocate(): void {
        this.device.context.texStorage3D(this.target, this.mipLevelCount, this.internalFormat, this.width, this.height, this.depthOrArrayLayers)
    }

    protected attachTo(target: GLenum, attachment: GLenum, level: GLint, wrapped: WebGLTexture | null, layer: number): void {
        this.device.context.framebufferTextureLayer(target, attachment, wrapped, level, layer)
    }

}

class GLTexture2DArray extends GLTextureND {

    constructor(device: GLDevice, descriptor: DeepRequired<DefaultedGPUTextureDescriptor>) {
        super(device, descriptor, GL.TEXTURE_2D_ARRAY)
    }

    protected allocate(): void {
        this.device.context.texStorage3D(this.target, this.mipLevelCount, this.internalFormat, this.width, this.height, this.depthOrArrayLayers)
    }

    protected attachTo(target: GLenum, attachment: GLenum, level: GLint, wrapped: WebGLTexture | null, layer: number): void {
        this.device.context.framebufferTextureLayer(target, attachment, wrapped, level, layer)
    }

}

export class GLTextureView implements GPUTextureView {

    readonly __brand = "GPUTextureView";
    readonly label: string = this.descriptor.label

    private constructor(readonly texture: GLTexture, readonly descriptor: DeepRequired<GPUTextureViewDescriptor>) {}

    static create(texture: GLTexture, descriptor: GPUTextureViewDescriptor) {
        return new GLTextureView(texture, {
            ...descriptor,
            label: descriptor.label ?? `${texture.label}.view`,
            usage: descriptor.usage ?? texture.usage,
            format: descriptor.format ?? texture.format,
            dimension: descriptor.dimension ?? texture.dimension,
            baseArrayLayer: descriptor.baseArrayLayer ?? 0,
            arrayLayerCount: descriptor.arrayLayerCount ?? 1,
            baseMipLevel: descriptor.baseMipLevel ?? 0,
            mipLevelCount: descriptor.mipLevelCount ?? 1,
            aspect: descriptor.aspect ?? "all",
            swizzle: descriptor.swizzle ?? "rgba"
        })
    }

}

type DefaultedGPUTextureDescriptor = ReturnType<typeof descriptorWithDefaults>

function descriptorWithDefaults(descriptor: GPUTextureDescriptor) {
    const size = extent3D(descriptor.size)
    const dimension = descriptor.dimension ?? (size[2] === 1 ? "2d" : "3d")
    return {
        ...descriptor,
        label: descriptor.label ?? "[Unlabeled Texture]",
        size,
        dimension,
        viewFormats: descriptor.viewFormats ?? [descriptor.format],
        textureBindingViewDimension: descriptor.textureBindingViewDimension ?? dimension,
        mipLevelCount: descriptor.mipLevelCount ?? 1,
        sampleCount: descriptor.sampleCount ?? 1,
    }
}

function textureTarget(dimension: GPUTextureViewDimension, sampleCount: number): number {
    if (sampleCount !== 1) {
        return GL.RENDERBUFFER
    }
    switch (dimension) {
        case "1d"        : return GL.TEXTURE_2D
        case "2d"        : return GL.TEXTURE_2D
        case "3d"        : return GL.TEXTURE_3D
        case "2d-array"  : return GL.TEXTURE_2D_ARRAY
        case "cube"      : return GL.TEXTURE_CUBE_MAP
        case "cube-array": return GL.TEXTURE_CUBE_MAP
    }
}

function textureFormat(format: GPUTextureFormat): GLenum {
    switch (format) {
        case "rgba8unorm"     : return GL.RGBA8
        case "bgra8unorm"     : return GL.RGBA8
        case "rgba8unorm-srgb": return GL.SRGB8_ALPHA8
        case "bgra8unorm-srgb": return GL.SRGB8_ALPHA8
        case "rgba16float"    : return GL.RGBA16F
        case "rgba32float"    : return GL.RGBA32F
        case "depth16unorm"   : return GL.DEPTH_COMPONENT16
        case "depth24plus"    : return GL.DEPTH_COMPONENT24
        case "depth32float"   : return GL.DEPTH_COMPONENT32F
        default: return GL.RGBA8
    }
}
