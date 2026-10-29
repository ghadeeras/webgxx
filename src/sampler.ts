import type { GLDevice } from "./device.js"
import { compareFunction, GL } from "./utils.js"

export class GLSampler implements GPUSampler {
    
    readonly wrapped: WebGLSampler = this.device.context.createSampler()

    constructor(readonly device: GLDevice, readonly descriptor: DefaultedGPUSamplerDescriptor) {
        const gl = device.context
        gl.samplerParameteri(this.wrapped, GL.TEXTURE_MAG_FILTER, GL[magFilter(descriptor.magFilter)])
        gl.samplerParameteri(this.wrapped, GL.TEXTURE_MIN_FILTER, GL[minFilter(descriptor.minFilter, descriptor.mipmapFilter)])
        gl.samplerParameteri(this.wrapped, GL.TEXTURE_WRAP_S, addressMode(descriptor.addressModeU))
        gl.samplerParameteri(this.wrapped, GL.TEXTURE_WRAP_T, addressMode(descriptor.addressModeV))
        gl.samplerParameteri(this.wrapped, GL.TEXTURE_WRAP_R, addressMode(descriptor.addressModeW))
        gl.samplerParameterf(this.wrapped, GL.TEXTURE_MIN_LOD, descriptor.lodMinClamp)
        gl.samplerParameterf(this.wrapped, GL.TEXTURE_MAX_LOD, descriptor.lodMaxClamp)
        if (descriptor.compare !== undefined) {
            gl.samplerParameteri(this.wrapped, GL.TEXTURE_COMPARE_MODE, GL.COMPARE_REF_TO_TEXTURE)
            gl.samplerParameteri(this.wrapped, GL.TEXTURE_COMPARE_FUNC, compareFunction(descriptor.compare))
        }
    }

    static create(device: GLDevice, descriptor: GPUSamplerDescriptor) {
        return new GLSampler(device, descriptorWithDefaults(descriptor))
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUSampler"

    readonly label: string = this.descriptor.label

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

type DefaultedGPUSamplerDescriptor = ReturnType<typeof descriptorWithDefaults>

function descriptorWithDefaults(descriptor: GPUSamplerDescriptor) {
    return {
        label: descriptor.label ?? "[Unlabeled Sampler]",
        addressModeU: descriptor.addressModeU ?? "repeat",
        addressModeV: descriptor.addressModeV ?? "repeat",
        addressModeW: descriptor.addressModeW ?? "repeat",
        minFilter: descriptor.minFilter ?? "nearest",
        magFilter: descriptor.magFilter ?? "nearest",
        mipmapFilter: descriptor.mipmapFilter ?? "nearest",
        lodMinClamp: descriptor.lodMinClamp ?? 0,
        lodMaxClamp: descriptor.lodMaxClamp ?? 16,
        maxAnisotropy: descriptor.maxAnisotropy ?? 1,
        compare: descriptor.compare
    }
}

function addressMode(addressMode: GPUAddressMode): number {
    switch (addressMode) {
        case "repeat": return GL.REPEAT
        case "mirror-repeat": return GL.MIRRORED_REPEAT
        case "clamp-to-edge": return GL.CLAMP_TO_EDGE
    }
}

function minFilter(minFilter: GPUFilterMode, mipmapFilter: GPUMipmapFilterMode) {
    return `${magFilter(minFilter)}_MIPMAP_${magFilter(mipmapFilter)}` as const
}

function magFilter(filter: GPUFilterMode) {
    switch (filter) {
        case "nearest": return "NEAREST" as const
        case "linear": return "LINEAR" as const
    }
}
