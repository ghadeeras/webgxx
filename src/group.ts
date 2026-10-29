import type { GLDevice } from "./device.js"

export class GLBindGroupLayout implements GPUBindGroupLayout {

    constructor(readonly device: GLDevice, readonly descriptor: GPUBindGroupLayoutDescriptor) {}

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUBindGroupLayout"

    readonly label: string = this.descriptor.label ?? "[Unlabeled Group Layout]"

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

export class GLBindGroup implements GPUBindGroup {

    constructor(readonly device: GLDevice, readonly descriptor: GPUBindGroupDescriptor) {}

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUBindGroup"

    readonly label: string = this.descriptor.label ?? `${this.descriptor.layout.label}.instance`

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

