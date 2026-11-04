import api from "./Api";
import type { Usuario } from "../../models/UsuariosModel";
import type { UpdateUsuarioPayload } from "../../models/UsuariosModel";
export class UsuariosApi {
  public static async getAllUsuarios(): Promise<Usuario[]> {
    const response = await api.get(`/usuarios/all`);
    return response as Usuario[];
  }

  public static async updateById(usuarioId: number, usuario: Usuario): Promise<Usuario> {
    const response = await api.put(`/usuarios/${usuarioId}`, usuario as UpdateUsuarioPayload);
    return response as Usuario;
  }

  public static async create(usuario: Partial<Usuario>): Promise<{ status: boolean, message: string }> {
    const response = await api.post(`/usuarios`, usuario as Usuario);
    return response as { status: boolean, message: string };
  }

  public static async deleteById(usuarioId: number): Promise<{ status: boolean, message: string }> {
    const response = await api.delete(`/usuarios/${usuarioId}`);
    return response as { status: boolean, message: string };
  }
  
}
