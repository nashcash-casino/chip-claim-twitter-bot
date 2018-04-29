module.exports = {
  webpack: (config, options) => {
    // https://github.com/jaredpalmer/backpack/issues/42
    config.plugins.splice(1, 1) // remove the BannerPlugin
    return config
  }
}
