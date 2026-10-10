/** "/transport/vehicles/new" -> "/transport/vehicles"; "/transport/vehicles/<id>/edit" -> "/transport/vehicles". */
export function parentPathOf(pathname: string): string {
  const parts = pathname.replace(/\/+$/, "").split("/");
  return parts.slice(0, parts[parts.length - 1] === "edit" ? -2 : -1).join("/") || "/";
}
