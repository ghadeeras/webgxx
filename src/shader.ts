import type { GLDevice } from "./device.js"
import type { DeepRequired } from "./utils.js"

export class GLShaderModule implements GPUShaderModule {
    
    private messages: GPUCompilationMessage[] = []
    readonly shader: WebGLShader | null

    private constructor(readonly device: GLDevice, readonly descriptor: DeepRequired<GPUShaderModuleDescriptor>) {
        const [code, type] = es300Code(descriptor.code)
        this.shader = this.compile(code, type)
    }

    static create(device: GLDevice, descriptor: GPUShaderModuleDescriptor) {
        return new GLShaderModule(device, {
            code: descriptor.code,
            compilationHints: [...(descriptor.compilationHints ?? [])].map(hint => ({
                entryPoint: hint.entryPoint,
                layout: hint.layout ?? "auto"
            })),
            label: descriptor.label ?? "[Unlabeled Shader Module]"
        })
    }

    /* vvvvvvvvvvvvvvvv PUBLIC API vvvvvvvvvvvvvvvv */
    
    readonly __brand = "GPUShaderModule"
    
    readonly label = this.descriptor.label
    
    async getCompilationInfo(): Promise<GPUCompilationInfo> {
        return {
            __brand: "GPUCompilationInfo",
            messages: this.messages
        }
    }

    /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
    
    private compile(code: string, type: "VERTEX_SHADER" | "FRAGMENT_SHADER") {
        const gl = this.device.context
        let shader = gl.createShader(WebGL2RenderingContext[type])
        if (shader === null) {
            this.pushMessage("Failed to create GL shader")
        } else {
            gl.shaderSource(shader, code)
            gl.compileShader(shader)
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(shader)
                gl.deleteShader(shader)
                shader = null
                this.pushMessage(log ?? "Compilation failed!")
            }
        }
        return shader
    }

    private pushMessage(m: string) {
        this.messages.push({
            __brand: "GPUCompilationMessage",
            length: 0,
            lineNum: 1,
            linePos: 1,
            message: m,
            offset: 0,
            type: "error"
        });
    }

}

function es300Code(code: string) {
    const type = code.indexOf("gl_Position") >= 0 ? "VERTEX_SHADER" : "FRAGMENT_SHADER"
    const wrappedCode = code.indexOf("#version 300 es") < 0 ? es300Wrap(type, code) : code
    return [wrappedCode, type] as const
}

function es300Wrap(type: string, code: string) {
    return `#version 300 es
    ${type === "FRAGMENT_SHADER" ? "precision highp float;" : ""}
    ${code}`
}
