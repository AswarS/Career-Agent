declare module 'content-disposition' {
  interface ContentDispositionOptions {
    type?: string;
    fallback?: string | boolean;
  }

  function contentDisposition(
    filename?: string,
    options?: ContentDispositionOptions,
  ): string;

  export = contentDisposition;
}
