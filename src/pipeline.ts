import { GLBuffer } from "./buffer.js"
import type { GLDevice } from "./device.js"
import { GLBindGroupLayout } from "./group.js"
import { GLSampler } from "./sampler.js"
import { GLShaderModule } from "./shader.js"
import { GLTexture, GLTextureView } from "./texture.js"
import { cast, compareFunction, optional, expect, extend, GL, derivable, required, type GLBufferBinding, type GLGroupDynamicBinding, type SparseArray, type GLIndexBufferBinding } from "./utils.js"

export class GLPipelineLayout implements GPUPipelineLayout {

    constructor(readonly device: GLDevice, readonly descriptor: GPUPipelineLayoutDescriptor) {}

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUPipelineLayout"

    readonly label: string = this.descriptor.label ?? "[Unlabeled Pipeline Layout]"

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
}

export class GLRenderPipeline implements GPURenderPipeline {

    readonly program: WebGLProgram = this.linkVertexAndFragmentStages()
    readonly bindGroupSockets: SparseArray<SparseArray<BindingSlot>> = this.initBindGroupSockets()
    readonly vertexBufferSockets: AttributeSlot[][] = this.initVertexBufferSocket()
    
    readonly depthFunc: number = this.descriptor.depthStencil !== undefined ? compareFunction(this.descriptor.depthStencil.depthCompare) : GL.GREATER
    readonly indexType = stripIndexFormat(this.descriptor.primitive.stripIndexFormat)
    readonly mode = topology(this.descriptor.primitive.topology)

    private constructor(readonly device: GLDevice, readonly descriptor: DefaultedGPURenderPipelineDescriptor) {
    }

    static create(device: GLDevice, descriptor: GPURenderPipelineDescriptor) {
        return new GLRenderPipeline(device, descriptorWithDefaults(descriptor))
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPURenderPipeline"
    
    readonly label: string = this.descriptor.label

    getBindGroupLayout(index: number): GPUBindGroupLayout {
        const socket = (this.bindGroupSockets[index] ?? []).filter(layout => layout !== undefined)
        return new GLBindGroupLayout(this.device, {
            entries: [...socket.entries()].map(([binding, layout]) => {
                const l = { ...layout }
                return {
                    binding,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    ...layout
                }
            })
        })
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
    draw(
        groupBindings: (GLGroupDynamicBinding | undefined)[], 
        vertexBufferBindings: (GLBufferBinding | undefined)[],
        viewport: [number, number, number, number],

        vertexCount: number, instanceCount: number, firstVertex: number, firstInstance: number
    ) {
        this.whileBoundTo(groupBindings, vertexBufferBindings, viewport, () => {
            this.device.context.drawArraysInstanced(this.mode, firstVertex, vertexCount, instanceCount)
        })
    }

    drawIndexed(
        groupBindings: (GLGroupDynamicBinding | undefined)[], 
        vertexBufferBindings: (GLBufferBinding | undefined)[],
        indexBufferBinding: GLIndexBufferBinding,
        viewport: [number, number, number, number],

        indexCount: number, instanceCount: number, firstIndex: number, baseVertex: number, firstInstance: number
    ) {
        this.whileBoundTo(groupBindings, vertexBufferBindings, viewport, () => {
            const indexType = indexBufferBinding.indexFormat === "uint32" ? GL.UNSIGNED_INT : GL.UNSIGNED_SHORT
            indexBufferBinding.buffer.whileBound(() => {
                this.device.context.drawElementsInstanced(this.mode, indexCount, indexType, indexBufferBinding.offset, instanceCount)
            })
        })
    }

    private linkVertexAndFragmentStages() {
        const gl = this.device.context
        const program = gl.createProgram()
        if (!program) {
            expect("Successful GL program creation")
        }
        gl.attachShader(program, this.descriptor.vertex.module.shader ?? expect("Initialized vertex shader"))
        if (this.descriptor.fragment !== undefined) {
            gl.attachShader(program, this.descriptor.fragment.module.shader ?? expect("Initialized fragment shader"))
        }
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const logs = gl.getProgramInfoLog(program)
            gl.deleteProgram(program)
            expect(`Successful linking. Logs: ${logs}`)
        }
        return program
    }

    private initBindGroupSockets() {
        const gl = this.device.context
        const program = this.program
        const groupLayouts: BindingSlot[][] = []
        addUniformBindings()
        addTextureBindings()
        return groupLayouts

        function addUniformBindings() {
            const uniformsCount = gl.getProgramParameter(program, GL.ACTIVE_UNIFORM_BLOCKS)
            for (let i = 0; i < uniformsCount; i++) {
                const name = gl.getActiveUniformBlockName(program, i) ?? ""
                const size = gl.getActiveUniformBlockParameter(program, i, GL.UNIFORM_BLOCK_DATA_SIZE) as number
                const parts = name.split("_")
                const group   = Number.parseInt(parts[parts.length - 2] ?? expect("Specified uniform group attribute"))
                const binding = Number.parseInt(parts[parts.length - 1] ?? expect("Specified uniform binding attribute"))
                gl.uniformBlockBinding(program, i, i)
                addBinding(group, binding, {
                    buffer: { type: "uniform" },
                    binder: (bufferBinding, offset) => {
                        const buffer = bufferBinding.buffer as GLBuffer
                        gl.bindBufferRange(buffer.target, i, buffer.wrapped, offset + (bufferBinding.offset ?? 0), size)
                    }
                })
            }
        }

        function addTextureBindings() {
            const samplersCount = gl.getProgramParameter(program, GL.ACTIVE_UNIFORMS)
            let unit = 0
            for (let i = 0; i < samplersCount; i++) {
                const info = gl.getActiveUniform(program, i)
                if (info === null || !samplerTypes.has(info.type)) {
                    continue
                }
                const parts = info.name.split("_")
                const textureGroup   = Number.parseInt(parts[parts.length - 4] ?? expect("Specified texture group attribute"))
                const textureBinding = Number.parseInt(parts[parts.length - 3] ?? expect("Specified texture binding attribute"))
                const samplerGroup   = Number.parseInt(parts[parts.length - 2] ?? expect("Specified sampler group attribute"))
                const samplerBinding = Number.parseInt(parts[parts.length - 1] ?? expect("Specified sampler binding attribute"))
                const uniformLocation = gl.getUniformLocation(program, info.name)
                const textureUnit = unit++
                addBinding(textureGroup, textureBinding, {
                    texture: {},
                    binder: (textureView: GPUTextureView) => {
                        const texture = (textureView as GLTextureView).texture
                        gl.activeTexture(GL.TEXTURE0 + textureUnit)
                        gl.bindTexture(texture.target, texture.wrapped)
                    }
                })
                addBinding(samplerGroup, samplerBinding, {
                    sampler: {},
                    binder: (resource: GPUSampler) => {
                        const sampler = resource as GLSampler
                        gl.activeTexture(GL.TEXTURE0 + textureUnit)
                        gl.bindSampler(textureUnit, sampler.wrapped)
                        gl.uniform1i(uniformLocation, textureUnit)
                    }
                })
            }
        }

        function addBinding(group: number, binding: number, layout: BindingSlot) {
            extend(groupLayouts, group)
            const bindings = groupLayouts[group] = groupLayouts[group] ?? []
            extend(bindings, binding)
            bindings[binding] = layout
        }
    }

    private initVertexBufferSocket() {
        const gl = this.device.context
        const vertexBufferLayouts: AttributeSlot[][] = []
        const bufferSlots = this.descriptor.vertex.buffers
        for (const bufferSlot of bufferSlots) {
            const bufferAttributes: AttributeSlot[] = []
            vertexBufferLayouts.push(bufferAttributes)
            if (bufferSlot === null) {
                continue
            }
            const stride = bufferSlot.arrayStride
            for (const { shaderLocation, format, offset } of bufferSlot.attributes) {
                const [size, type, normalized] = attributeFormat(format)
                bufferAttributes.push({
                    enable: () => gl.enableVertexAttribArray(shaderLocation),
                    disable: () => gl.disableVertexAttribArray(shaderLocation),
                    pointTo: (viewOffset = 0) => gl.vertexAttribPointer(shaderLocation, size, type, normalized, stride, offset + viewOffset)
                })
            }
        }
        return vertexBufferLayouts
    }

    private whileBoundTo(
        groupBindings: (GLGroupDynamicBinding | undefined)[], 
        vertexBufferBindings: (GLBufferBinding | undefined)[],
        viewport: [number, number, number, number],
        logic: () => void
    ) {
        const gl = this.device.context
        gl.useProgram(this.program)
        this.setupResourceGroups(groupBindings)
        this.setupVertexState(vertexBufferBindings)
        this.setupPrimitiveState()
        this.setupFragmentState()
        this.setupDepthStencilState()
        gl.viewport(...viewport)
        try {
            logic()
        } finally {
            this.disableVertexAttributes()
            this.device.context.useProgram(null)
        }
    }

    private setupResourceGroups(groupBindings: (GLGroupDynamicBinding | undefined)[]) {
        for (const [index, layout] of this.bindGroupSockets.entries()) {
            if (layout === undefined) {
                continue
            }
            const groupBinding = groupBindings[index]
            if (groupBinding === undefined) {
                return expect("A bind group at index " + index)
            }
            this.bindGroup(layout, groupBinding)
        }
    }

    private setupVertexState(bindings: (GLBufferBinding | undefined)[]) {
        this.enableVertexAttributes()
        for (const [slot, layout] of this.vertexBufferSockets.entries()) {
            if (layout.length === 0) {
                continue
            }
            const vertexBuffer = bindings[slot]
            if (vertexBuffer === undefined) {
                return expect("A vertex buffer at slot " + slot)
            }
            this.bindVertexBuffer(layout, vertexBuffer)
        }
    }

    private setupPrimitiveState() {
        const gl = this.device.context
        if (this.descriptor.primitive.cullMode !== "none") {
            gl.enable(GL.CULL_FACE)
            gl.cullFace(this.descriptor.primitive.cullMode === "front" ? GL.FRONT : GL.BACK)
            gl.frontFace(this.descriptor.primitive.frontFace === "cw" ? GL.CW : GL.CCW)
        } else {
            gl.disable(GL.CULL_FACE)
        }
    }

    private setupFragmentState() {
        const gl = this.device.context
        if (this.descriptor.fragment !== undefined) {
            for (const target of this.descriptor.fragment.targets) {
                if (target === null) {
                    continue
                }
                if (target.blend !== undefined) {
                    gl.enable(GL.BLEND)
                    gl.blendFuncSeparate(
                        blendFactor(target.blend.color.srcFactor),
                        blendFactor(target.blend.color.dstFactor),
                        blendFactor(target.blend.alpha.srcFactor),
                        blendFactor(target.blend.alpha.dstFactor),
                    )
                    gl.blendEquationSeparate(
                        blendOperation(target.blend.color.operation),
                        blendOperation(target.blend.alpha.operation),
                    )
                } else {
                    gl.disable(GL.BLEND)
                }
            }
        }
    }

    private setupDepthStencilState() {
        const gl = this.device.context
        if (this.descriptor.depthStencil !== null) {
            gl.enable(GL.DEPTH_TEST)
            gl.depthFunc(this.depthFunc)
        } else {
            gl.disable(GL.DEPTH_TEST)
        }
    }

    private enableVertexAttributes() {
        for (const buffer of this.vertexBufferSockets) {
            for (const attribute of buffer) {
                attribute.enable()
            }
        }
    }

    private disableVertexAttributes() {
        for (const buffer of this.vertexBufferSockets) {
            for (const attribute of buffer) {
                attribute.disable()
            }
        }
    }

    private bindGroup(groupLayout: SparseArray<BindingSlot>, groupBinding: GLGroupDynamicBinding) {
        const offsets = groupBinding.dynamicOffsetsData instanceof Uint32Array ? groupBinding.dynamicOffsetsData : [...groupBinding.dynamicOffsetsData]
        const glBindGroup = groupBinding.bindGroup
        for (const [binding, layout] of groupLayout.entries()) {
            if (layout === undefined) {
                continue
            }
            const entry = glBindGroup.descriptor.entries[binding]
            if (entry === undefined) {
                continue
            }
            const resource = entry.resource
            if ("buffer" in layout) {
                const bufferResource: GPUBufferBinding = 
                      resource instanceof GLBuffer ? { buffer: resource } 
                    : "buffer" in resource ? resource 
                    : expect("Buffer binding")
                layout.binder(bufferResource, offsets[binding] ?? 0)
            } else if ("texture" in layout) {
                const textureResource: GPUTextureView = 
                      resource instanceof GLTexture ? resource.createView() 
                    : resource instanceof GLTextureView ? resource
                    : expect("Texture binding")
                layout.binder(textureResource)
            } else if ("sampler" in layout) {
                const samplerResource: GPUSampler = 
                      resource instanceof GLSampler ? resource 
                    : expect("Sampler binding")
                layout.binder(samplerResource)
            } else {
                return expect("Supported resource")
            }
        }
    }

    private bindVertexBuffer(attributes: AttributeSlot[], binding: GLBufferBinding): undefined {
        binding.buffer.whileBound(() => {
            for (const attribute of attributes) {
                attribute.pointTo(binding.offset)
            }
        })
    }

}

type DefaultedGPURenderPipelineDescriptor = ReturnType<typeof descriptorWithDefaults>

type BindingSlot = ( 
    | { buffer: GPUBufferBindingLayout, binder: (resource: GPUBufferBinding, offset: number) => void } 
    | { texture: GPUTextureBindingLayout, binder: (resource: GPUTextureView) => void } 
    | { sampler: GPUSamplerBindingLayout, binder: (resource: GPUSampler) => void }
)

type AttributeSlot = {
    enable: () => void,
    disable: () => void,
    pointTo: (offset?: number) => void
}

const samplerTypes = new Set<number>([GL.SAMPLER_2D, GL.SAMPLER_3D, GL.SAMPLER_2D_ARRAY, GL.SAMPLER_2D_ARRAY_SHADOW, GL.SAMPLER_2D_SHADOW, GL.SAMPLER_CUBE, GL.SAMPLER_CUBE_SHADOW])

function topology(topology: GPUPrimitiveTopology) {
    switch (topology) {
        case "line-list": return GL.LINES
        case "line-strip": return GL.LINE_STRIP
        case "point-list": return GL.POINTS
        case "triangle-list": return GL.TRIANGLES
        case "triangle-strip": return GL.TRIANGLE_STRIP
    }
}

function stripIndexFormat(stripIndexFormat: GPUIndexFormat): [GLenum, GLsizei] {
    switch (stripIndexFormat) {
        case "uint16": return [GL.UNSIGNED_SHORT, 2]
        case "uint32": return [GL.UNSIGNED_INT  , 4]
    }
}

function attributeFormat(format: GPUVertexFormat): [number, number, boolean] {
    switch (format) {
        case "sint8"    : return [1, GL.BYTE          , false]
        case "sint8x2"  : return [2, GL.BYTE          , false]
        case "sint8x4"  : return [4, GL.BYTE          , false]
        case "sint16"   : return [1, GL.SHORT         , false]
        case "sint16x2" : return [2, GL.SHORT         , false]
        case "sint16x4" : return [4, GL.SHORT         , false]
        case "uint8"    : return [1, GL.UNSIGNED_BYTE , false]
        case "uint8x2"  : return [2, GL.UNSIGNED_BYTE , false]
        case "uint8x4"  : return [4, GL.UNSIGNED_BYTE , false]
        case "uint16"   : return [1, GL.UNSIGNED_SHORT, false]
        case "uint16x2" : return [2, GL.UNSIGNED_SHORT, false]
        case "uint16x4" : return [4, GL.UNSIGNED_SHORT, false]
        case "snorm8"   : return [1, GL.BYTE          , true ]
        case "snorm8x2" : return [2, GL.BYTE          , true ]
        case "snorm8x4" : return [4, GL.BYTE          , true ]
        case "snorm16"  : return [1, GL.SHORT         , true ]
        case "snorm16x2": return [2, GL.SHORT         , true ]
        case "snorm16x4": return [4, GL.SHORT         , true ]
        case "unorm8"   : return [1, GL.UNSIGNED_BYTE , true ]
        case "unorm8x2" : return [2, GL.UNSIGNED_BYTE , true ]
        case "unorm8x4" : return [4, GL.UNSIGNED_BYTE , true ]
        case "unorm16"  : return [1, GL.UNSIGNED_SHORT, true ]
        case "unorm16x2": return [2, GL.UNSIGNED_SHORT, true ]
        case "unorm16x4": return [4, GL.UNSIGNED_SHORT, true ]
        case "float32"  : return [1, GL.FLOAT         , false]
        case "float32x2": return [2, GL.FLOAT         , false]
        case "float32x3": return [3, GL.FLOAT         , false]
        case "float32x4": return [4, GL.FLOAT         , false]
        default: { throw new Error(`Unsupported format ${format}`)}
    }
}

function blendFactor(srcFactor: GPUBlendFactor): number {
    switch (srcFactor) {
        case "constant"           : return GL.CONSTANT_COLOR
        case "dst"                : return GL.DST_COLOR
        case "dst-alpha"          : return GL.DST_ALPHA
        case "one"                : return GL.ONE
        case "one-minus-constant" : return GL.ONE_MINUS_CONSTANT_COLOR
        case "one-minus-dst"      : return GL.ONE_MINUS_DST_COLOR
        case "one-minus-dst-alpha": return GL.ONE_MINUS_DST_ALPHA
        case "one-minus-src"      : return GL.ONE_MINUS_SRC_COLOR
        case "one-minus-src-alpha": return GL.ONE_MINUS_SRC_ALPHA
        case "src"                : return GL.SRC_COLOR
        case "src-alpha"          : return GL.SRC_ALPHA
        case "src-alpha-saturated": return GL.SRC_ALPHA_SATURATE
        case "zero"               : return GL.ZERO
    }
}

function blendOperation(op: GPUBlendOperation): number {
    switch (op) {
        case "add"             : return GL.FUNC_ADD
        case "max"             : return GL.MAX
        case "min"             : return GL.MIN
        case "reverse-subtract": return GL.FUNC_REVERSE_SUBTRACT
        case "subtract"        : return GL.FUNC_SUBTRACT
    }
}

function descriptorWithDefaults(descriptor: GPURenderPipelineDescriptor) {
    return {
        label: descriptor.label ?? "[Unlabeled Pipeline]",
        layout: descriptor.layout,
        vertex: required(descriptor.vertex, vertex => ({
            module: cast(vertex.module, GLShaderModule),
            entryPoint: descriptor.vertex.entryPoint ?? "main",
            buffers: (descriptor.vertex.buffers ?? []).map(buffer => buffer !== null ? {
                ...buffer,
                stepMode: buffer.stepMode ?? "vertex",
            } : null),
            constants: descriptor.vertex.constants ?? {}
        })),
        primitive: derivable(descriptor.primitive, primitive => ({
            topology: primitive.topology ?? "triangle-list",
            stripIndexFormat: primitive.stripIndexFormat ?? "uint16",
            frontFace: primitive.frontFace ?? "ccw",
            cullMode: primitive.cullMode ?? "none",
            unclippedDepth: primitive.unclippedDepth ?? false
        })),
        depthStencil: optional(descriptor.depthStencil, depthStencil => ({
            format: depthStencil.format ?? "depth24plus",
            depthBias: depthStencil.depthBias ?? 0,
            depthBiasClamp: depthStencil.depthBiasClamp ?? 0,
            depthBiasSlopeScale: depthStencil.depthBiasSlopeScale ?? 0,
            depthCompare: depthStencil.depthCompare ?? "always",
            depthWriteEnabled: depthStencil.depthWriteEnabled ?? false,
            stencilBack: optional(depthStencil.stencilBack, stencilBack => ({
                compare: stencilBack.compare ?? "always",
                depthFailOp: stencilBack.depthFailOp ?? "keep",
                failOp: stencilBack.failOp ?? "keep",
                passOp: stencilBack.passOp ?? "keep",
            })),
            stencilFront: optional(depthStencil.stencilFront, stencilFront => ({
                compare: stencilFront.compare ?? "always",
                depthFailOp: stencilFront.depthFailOp ?? "keep",
                failOp: stencilFront.failOp ?? "keep",
                passOp: stencilFront.passOp ?? "keep"
            })),
            stencilReadMask: depthStencil.stencilReadMask ?? 0,
            stencilWriteMask: depthStencil.stencilWriteMask ?? 0,
        })),
        fragment: optional(descriptor.fragment, fragment => ({
            module: cast(fragment.module, GLShaderModule),
            entryPoint: fragment.entryPoint ?? "main",
            targets: (fragment.targets ?? []).map(target => target !== null ? {
                format: target.format,
                blend: optional(target.blend, blend => ({
                    alpha: required(blend.alpha, alpha => ({
                        srcFactor: alpha.srcFactor ?? "one",
                        dstFactor: alpha.dstFactor ?? "zero",
                        operation: alpha.operation ?? "add"
                    })),
                    color: required(blend.color, color => ({
                        srcFactor: color.srcFactor ?? "one",
                        dstFactor: color.dstFactor ?? "zero",
                        operation: color.operation ?? "add"
                    })),
                })),
                writeMask: target.writeMask ?? 0
            } : null),
            constants: fragment.constants ?? {},
        })),
        multisample: derivable(descriptor.multisample, multisample => ({
            count: multisample.count ?? 1,
            mask: multisample.mask ?? 0,
            alphaToCoverageEnabled: multisample.alphaToCoverageEnabled ?? false
        }))
    } satisfies GPURenderPipelineDescriptor
}
