import { GLDevice } from "./device.js"
import type { GLGPU } from "./gpu.js"
import type { DeepRequired } from "./utils.js"

export class GLAdapter implements GPUAdapter {
    
    private constructor(readonly gpu: GLGPU, readonly options: DeepRequired<GPURequestAdapterOptions>) {}

    static create(gpu: GLGPU, options: GPURequestAdapterOptions): GPUAdapter | null {
        const defaultedOptions: DeepRequired<GPURequestAdapterOptions> = {
            featureLevel: options.featureLevel ?? "compatibility", // TODO: revert back to "core"
            forceFallbackAdapter: options.forceFallbackAdapter ?? false,
            powerPreference: options.powerPreference ?? "low-power",
            xrCompatible: options.xrCompatible ?? false
        }
        return defaultedOptions.featureLevel === "compatibility" ? new GLAdapter(gpu, defaultedOptions) : null
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUAdapter"

    readonly features: GPUSupportedFeatures = new Set()
    
    readonly info: GPUAdapterInfo = {
        __brand: "GPUAdapterInfo",
        architecture: "WebGL2",
        description: "Partial implementation of a subset of WebGPU on top of WebGL2",
        device: "WebGL2",
        isFallbackAdapter: false,
        vendor: "WebGL2",                
    }

    /**
     * The supported limits are currently the minimum limits of WebGPU's compatibility mode. But they do not reflect the correct limits yet (TODO), 
     * and they can never reach the minimum limits as required by the specs.
     */
    readonly limits: GPUSupportedLimits = {
        __brand : "GPUSupportedLimits",
        maxTextureDimension1D: 4096,
        maxTextureDimension2D: 4096,
        maxTextureDimension3D: 2048,
        maxTextureArrayLayers: 256,
        maxBindGroups: 4,
        maxBindGroupsPlusVertexBuffers: 24,
        maxBindingsPerBindGroup: 1000,
        maxDynamicUniformBuffersPerPipelineLayout: 8,
        maxDynamicStorageBuffersPerPipelineLayout: 4,
        maxSampledTexturesPerShaderStage: 16,
        maxSamplersPerShaderStage: 16,
        maxStorageBuffersPerShaderStage: 8,
        maxStorageBuffersInVertexStage: 0,
        maxStorageBuffersInFragmentStage: 4,
        maxStorageTexturesPerShaderStage: 4,
        maxStorageTexturesInVertexStage: 0,
        maxStorageTexturesInFragmentStage: 4,
        maxUniformBuffersPerShaderStage: 12,
        maxUniformBufferBindingSize: 16384,
        maxStorageBufferBindingSize: 134217728,
        minUniformBufferOffsetAlignment: 256,
        minStorageBufferOffsetAlignment: 256,
        maxVertexBuffers: 8,
        maxBufferSize: 268435456,
        maxVertexAttributes: 16,
        maxVertexBufferArrayStride: 2048,
        maxInterStageShaderVariables: 15,
        maxColorAttachments: 4,
        maxColorAttachmentBytesPerSample: 32,
        maxComputeWorkgroupStorageSize: 16384,
        maxComputeInvocationsPerWorkgroup: 128,
        maxComputeWorkgroupSizeX: 128,
        maxComputeWorkgroupSizeY: 128,
        maxComputeWorkgroupSizeZ: 64,
        maxComputeWorkgroupsPerDimension: 65535,
        maxImmediateSize: 64,
    }

    async requestDevice(descriptor: GPUDeviceDescriptor = {}): Promise<GPUDevice> {
        return GLDevice.create(this, descriptor)
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}
