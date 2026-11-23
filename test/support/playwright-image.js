const imageVersion = (dockerfile) =>
  /^FROM mcr\.microsoft\.com\/playwright:v([\d.]+)-/m.exec(dockerfile)?.[1]

/**
 * @param {string} dockerfile
 * @param {string | undefined} packageVersion
 * @returns {string | undefined} a failure message, or nothing when they match
 */
export const playwrightImageMismatch = (dockerfile, packageVersion) => {
  const image = imageVersion(dockerfile)

  if (!image) {
    return 'Dockerfile has no mcr.microsoft.com/playwright image to compare'
  }

  if (!packageVersion) {
    return 'package.json has no @playwright/test version to compare'
  }

  if (image !== packageVersion) {
    return `Dockerfile playwright image is ${image} but @playwright/test is ${packageVersion}`
  }
}
