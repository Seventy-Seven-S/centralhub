// Forma de los errores que llegan a los catch/onError del frontend: casi
// siempre un AxiosError con el cuerpo { message, code } que manda la API, o un
// Error común (fetch manual) con solo .message. Sustituye los `err: any`:
// describe lo que el código ya leía, sin cambiar cómo se lee.
export interface ErrorApi {
  message?: string;
  response?: {
    status?: number;
    data?: { message?: string; code?: string };
  };
}
