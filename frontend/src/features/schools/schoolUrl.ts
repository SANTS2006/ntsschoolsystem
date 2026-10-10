/** The address of a school's own sign-in page, e.g. https://app.example.com/greenwood/login — where the link
 * shown beside each school in the platform console leads, and the page its people sign in from. */
export function schoolUrl(slug: string): string {
  return `${window.location.origin}/${slug}/login`;
}
