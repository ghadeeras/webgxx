import type { GLAdapter } from "./adpater.js";
import { GLBuffer } from "./buffer.js";
import { GLCommandEncoder } from "./commands.js";
import { GLBindGroup, GLBindGroupLayout } from "./group.js";
import { GLPipelineLayout, GLRenderPipeline } from "./pipeline.js";
import { GLQueue } from "./queue.js";
import { GLSampler } from "./sampler.js";
import { GLShaderModule } from "./shader.js";
import { GLTexture } from "./texture.js";
import { expect, notImplemented, type DeepRequired } from "./utils.js";

export class GLDevice implements GPUDevice {

    private _onLost: (info: GPUDeviceLostInfo) => void = () => {}
    readonly context: WebGL2RenderingContext
    private _onuncapturederrorListeners: Set<UncapturedErrorListener> = new Set()
    private _onuncapturederror: UncapturedErrorListener | null = null

    private constructor(readonly adapter: GLAdapter, readonly descriptor: DeepRequired<GPUDeviceDescriptor>) {
        const canvas = adapter.gpu.canvas;
        canvas.addEventListener("webglcontextlost", event => {
            event.preventDefault()
            this._onLost({
                __brand: "GPUDeviceLostInfo",
                message: `WebGL context that backs the GPU Device '${this.label}' is lost!`,
                reason: "unknown",
            })
        }, false);

        this.context = canvas.getContext("webgl2", { 
            xrCompatible: adapter.options.xrCompatible,
            antialias: false, // Manually implemented
            depth: false, // Manually implemented 
            stencil: false, // Manually implemented 
            preserveDrawingBuffer: true, // To allow copying canvas content
        }) ?? expect("Support for WebGL 2 context")
    }

    static create(adapter: GLAdapter, descriptor: GPUDeviceDescriptor): GPUDevice {
        const adapterLimits = limitsOf(adapter);
        const defaultedDescriptor = descriptorWithDefaults(descriptor, adapter, adapterLimits)
        validateDescriptor(defaultedDescriptor, adapterLimits)
        return new GLDevice(adapter, defaultedDescriptor)
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUDevice";

    readonly label = this.descriptor.label

    readonly queue: GPUQueue = new GLQueue(this, this.descriptor.defaultQueue)

    readonly lost: Promise<GPUDeviceLostInfo> = new Promise(resolve => this._onLost = resolve)

    get adapterInfo(): GPUAdapterInfo {
        return this.adapter.info
    }

    get features(): GPUSupportedFeatures {
        return new Set(this.descriptor.requiredFeatures)
    }

    get limits(): GPUSupportedLimits {
        return {
            __brand: "GPUSupportedLimits",
            ...limitsOf(this.adapter),
            ...this.descriptor.requiredLimits
        }
    }

    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
        return new GLBindGroup(this, descriptor)
    }

    createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
        return new GLBindGroupLayout(this, descriptor)
    }

    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
        return GLBuffer.create(this, descriptor)
    }

    createCommandEncoder(descriptor: GPUCommandEncoderDescriptor = {}): GPUCommandEncoder {
        return  GLCommandEncoder.create(this, descriptor)
    }

    createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
        return notImplemented("createComputePipeline")
    }
    
    async createComputePipelineAsync(descriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline> {
        return this.createComputePipeline(descriptor)
    }

    createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
        return new GLPipelineLayout(this, descriptor);
    }

    createQuerySet(descriptor: GPUQuerySetDescriptor): GPUQuerySet {
        return notImplemented("createQuerySet")
    }
    
    createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder {
        return notImplemented("createRenderBundleEncoder")
    }

    createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
        return GLRenderPipeline.create(this, descriptor)
    }

    async createRenderPipelineAsync(descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
        return this.createRenderPipeline(descriptor)
    }

    createSampler(descriptor: GPUSamplerDescriptor = {}): GPUSampler {
        return GLSampler.create(this, descriptor)
    }

    createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule {
        return GLShaderModule.create(this, descriptor)
    }

    createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
        return GLTexture.create(this, descriptor)
    }

    destroy(): undefined {
        this._onLost({
            __brand: "GPUDeviceLostInfo",
            message: `GPU Device '${this.label}' is destroyed!`,
            reason: "destroyed",
        })
    }

    importExternalTexture(descriptor: GPUExternalTextureDescriptor): GPUExternalTexture {
        return notImplemented("importExternalTexture")
    }

    pushErrorScope(filter: GPUErrorFilter): undefined {
        return notImplemented("pushErrorScope")
    }

    popErrorScope(): Promise<GPUError | null> {
        return notImplemented("popErrorScope")
    }

    addEventListener<K extends string>(
        type: K, 
        listener: K extends "uncapturederror" ? UncapturedErrorListener : EventListenerOrEventListenerObject, 
        options?: boolean | AddEventListenerOptions
    ): void {
        switch (type) {
            case "uncapturederror": this._onuncapturederrorListeners.add(listener as UncapturedErrorListener); break;
            default: this.context.canvas.addEventListener(type, listener as EventListenerOrEventListenerObject, options)
        }
    }

    removeEventListener<K extends string>(
        type: K, 
        listener: K extends "uncapturederror" ? UncapturedErrorListener : EventListenerOrEventListenerObject, 
        options?: boolean | AddEventListenerOptions
    ): void {
        switch (type) {
            case "uncapturederror": this._onuncapturederrorListeners.delete(listener as UncapturedErrorListener); break;
            default: this.context.canvas.removeEventListener(type, listener as EventListenerOrEventListenerObject, options)
        }
    }

    dispatchEvent(event: Event): boolean {
        switch (event.type) {
            case "uncapturederror": {
                for (const listener of this._onuncapturederrorListeners) {
                    listener.bind(this)(event as GPUUncapturedErrorEvent)
                }
                return false
            }
            default: return this.context.canvas.dispatchEvent(event)
        }
    }
    
    get onuncapturederror() {
        return this._onuncapturederror
    }

    set onuncapturederror(listener: UncapturedErrorListener | null) {
        if (listener === this._onuncapturederror) {
            return
        }
        if (this._onuncapturederror !== null) {
            this.removeEventListener("uncapturederror", this._onuncapturederror)
        }
        if (listener !== null) {
            this.addEventListener("uncapturederror", listener)
        }
        this._onuncapturederror = listener
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

type AdapterLimits = Record<Exclude<keyof GPUSupportedLimits, "__brand">, GPUSize64>

function validateDescriptor(descriptor: DeepRequired<GPUDeviceDescriptor>, adapterLimits: AdapterLimits) {
    if (descriptor.requiredFeatures.length > 0) {
        return expect("No required features")
    }
    for (const limit in descriptor.requiredLimits) {
        if (!(limit in adapterLimits)) {
            return expect(`${limit} to be a known limit, i.e. one of: ${Object.keys(adapterLimits)}`)
        }
        const requiredLimit = descriptor.requiredLimits[limit] ?? 0
        const maxLimit = adapterLimits[limit as keyof typeof adapterLimits]
        if (requiredLimit > maxLimit) {
            return expect(`${limit} = ${requiredLimit} should be less than or equal to ${maxLimit}`)
        }
    }
}

function descriptorWithDefaults(descriptor: GPUDeviceDescriptor, adapter: GLAdapter, adapterLimits: AdapterLimits): DeepRequired<GPUDeviceDescriptor> {
    const label = descriptor.label ?? "[Unlabeled Device]";
    return {
        label,
        requiredFeatures: descriptor.requiredFeatures ?? [...adapter.features] as GPUFeatureName[],
        requiredLimits: descriptor.requiredLimits ?? adapterLimits,
        defaultQueue: { label: descriptor.defaultQueue?.label ?? `${label}.queue` },
    };
}

function limitsOf(adapter: GLAdapter): Record<Exclude<keyof GPUSupportedLimits, "__brand">, GPUSize64> {
    const limits: Record<string, GPUSize64> = {};
    for (const k in adapter.limits) {
        const l = adapter.limits[k as keyof GPUSupportedLimits];
        if (typeof l !== "number") {
            continue;
        }
        limits[k] = l;
    }
    return limits;
}

type UncapturedErrorListener = (this: GPUDevice, ev: GPUUncapturedErrorEvent)  => any

export class GLUncapturedErrorEvent extends Event implements GPUUncapturedErrorEvent {
    
    readonly __brand = "GPUUncapturedErrorEvent";

    constructor(readonly type: string, readonly gpuUncapturedErrorEventInitDict: GPUUncapturedErrorEventInit) {
        super(type)
    }

    get error() {
        return this.gpuUncapturedErrorEventInitDict.error
    }

}