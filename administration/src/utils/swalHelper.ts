import Swal, { type SweetAlertIcon } from "sweetalert2";

export class SwalHelper {
  public static async successToast(text: string) {
    return this.toast(text, "success");
    // return Swal.fire({
    //   text: text,
    //   icon: "success",
    //   timer: 1500,
    //   timerProgressBar: true,
    //   toast: true,
    //   position: "top-end",
    //   showConfirmButton: false,
    //   didOpen: (toast: HTMLDivElement) => {
    //     toast.addEventListener("mouseenter", Swal.stopTimer);
    //     toast.addEventListener("mouseleave", Swal.resumeTimer);
    //   },
    // });
  }

  public static async errorToast(text: string) {
    return this.toast(text, "error");
  }

  public static async toast(text: string, icon: string) {
    return Swal.fire({
      text: text,
      icon: icon as SweetAlertIcon,
      timer: 1500,
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timerProgressBar: true,
      didOpen: (toast: HTMLDivElement) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });
  }

  public static async confirm(
    title: string,
    text: string,
    icon: SweetAlertIcon,
    confirmButtonText?: string,
    cancelButtonText?: string,
    confirmButtonColor?: string,
    cancelButtonColor?: string
  ) {
    return Swal.fire({
      title: title,
      text: text,
      icon: icon as SweetAlertIcon,
      showCancelButton: true,
      confirmButtonText: confirmButtonText ?? "Sim",
      cancelButtonText: cancelButtonText ?? "Não",
      confirmButtonColor: confirmButtonColor ?? "#28a745",
      cancelButtonColor: cancelButtonColor ?? "#dc3545",
    });
  }
}
