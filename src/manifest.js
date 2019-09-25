
const fs = require('fs')
const pathUtils = require('path')
const dequal = require('fast-deep-equal')
const isUrl = require('is-url')

const { isFile, permRequestKeys } = require('./utils')

/**
 * Validates a plugin package.json file.
 * Exits with success message or gathers all errors before throwing at the end.
 */
module.exports = async function manifest (argv) {

  let isValid = true
  let didUpdate = false

  const { dist, ['outfile-name']: outfileName } = argv
  if (!dist) {
    throw new Error(`Invalid params: must provide 'dist'`)
  }

  // read the package.json file
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync('package.json'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Manifest error: Could not find package.json. Please ensure that ` +
        `you are running the command in the project root directory.`
      )
    }
    throw new Error(`Could not parse package.json`, err)
  }

  if (!pkg || typeof pkg !== 'object') {
    throw new Error(`Invalid parsed package.json: ${pkg}`)
  }
  
  // attempt to set missing/erroneous properties if commanded
  if (argv.populate) {

    let old = { ...pkg.web3Wallet }

    if (!pkg.web3Wallet) {
      pkg.web3Wallet = {}
    }
    if (!pkg.web3Wallet.bundle) {
      pkg.web3Wallet.bundle = {}
    }

    let { bundle, initialPermissions } = pkg.web3Wallet
    if (bundle && bundle.local) {
      const bundlePath = pathUtils.join(
        dist, outfileName || 'bundle.js'
      ).toString()
      if (bundle.local !== bundlePath) pkg.web3Wallet.bundle.local = bundlePath
    }

    if (!initialPermissions) {
      pkg.web3Wallet.initialPermissions = {}
    }
    initialPermissions = Object.keys(initialPermissions).sort().reduce(
      (acc, p) => {
        acc[p] = initialPermissions[p]
        return acc
    }, {})

    if (!dequal(old, pkg.web3Wallet)) didUpdate = true
  }

  // check presence of required keys
  const existing = Object.keys(pkg)
  const required = [
    'name', 'version', 'description', 'main', 'repository', 'web3Wallet'
  ]
  const missing = required.filter(k => !existing.includes(k))
  if (missing.length > 0) {
    logManifestError(
      `Missing required package.json properties:\n` +
      missing.reduce((acc, curr) => {
        acc += curr + '\n'
        return acc
      }, '')
    )
  }

  // check web3Wallet properties
  const { bundle, initialPermissions } = pkg.web3Wallet || {}
  if (bundle && bundle.local) {
    if (!(await isFile(bundle.local))) {
      logManifestError(`'bundle.local' does not resolve to a file.`)
    }
  } else {
    logManifestError(`Missing required 'web3Wallet' property 'bundle.local'.`)
  }

  if (bundle.url && !isUrl(bundle.url)) {
    logManifestError(`'bundle.url' does not resolve to a URL.`)
  }

  if (pkg.web3Wallet.hasOwnProperty('initialPermissions')) {
    if (
      typeof initialPermissions !== 'object' ||
      Array.isArray(initialPermissions)
    ) {
      logManifestError(`'web3Wallet' property 'initialPermissions' must be an object if present.`)

    } else if (Object.keys(initialPermissions).length > 0) {

      Object.entries(initialPermissions).forEach(([k, o]) => {
        if (typeof o !== 'object' || Array.isArray(o)) {
          logManifestError(`inital permission '${k}' must be an object`)

        } else {

          Object.keys(o).forEach(_k => {
            if (!permRequestKeys.includes(_k)) {
              logManifestError(`inital permission '${k}' has unrecognized key '${_k}'`)
            }

            if (_k === 'parentCapability' && k !== _k) {
              logManifestError(`inital permissions '${k}' has mismatched 'parentCapability' field '${o[_k]}'`)
            }
          })
        }
      })
    }
  }

  // validation complete, finish work and notify user

  if (argv.populate && didUpdate) {
    fs.writeFile('package.json', JSON.stringify(pkg, null, 2), (err) => {
      if (err) throw new Error(`Could not write package.json`, err)
      console.log(`Manifest Success: updated '${pkg.name}' package.json!`)
    })
  }

  if (isValid) {
    console.log(`Manifest Success: validated '${pkg.name}' package.json!`)
  } else {
    throw new Error(`Error: package.json validation failed, please see above warnings.`)
  }

  function logManifestError(message, err) {
    isValid = false
    console.error(`Manifest Error: ${message}`)
    if (err && mm_plugin.verbose) console.error(err)
  }
}