## [1.2.2](https://github.com/wyre-technology/halopsa-mcp/compare/v1.2.1...v1.2.2) (2026-04-06)


### Bug Fixes

* per-request MCP Server+Transport for gateway compatibility ([eafc93d](https://github.com/wyre-technology/halopsa-mcp/commit/eafc93d199d500edc76e6eb681cc7a4174add0f5))

## [1.2.1](https://github.com/wyre-technology/halopsa-mcp/compare/v1.2.0...v1.2.1) (2026-03-31)


### Bug Fixes

* **deploy:** replace node_compat with nodejs_compat for Wrangler v4 ([974b566](https://github.com/wyre-technology/halopsa-mcp/commit/974b5660324131550a035d5e33656ad495dd0252))

# [1.2.0](https://github.com/wyre-technology/halopsa-mcp/compare/v1.1.5...v1.2.0) (2026-03-10)


### Features

* **elicitation:** add MCP elicitation support with graceful fallback ([86c9c54](https://github.com/wyre-technology/halopsa-mcp/commit/86c9c545410ed4bf155132abd299590beec6984d))

## [1.1.5](https://github.com/wyre-technology/halopsa-mcp/compare/v1.1.4...v1.1.5) (2026-03-02)


### Bug Fixes

* **ci:** fix broken YAML in Discord notification step ([7d0e7d0](https://github.com/wyre-technology/halopsa-mcp/commit/7d0e7d074bc9a394eb335591fffc0f8f8a3af4d8))
* **ci:** move Discord notification into release workflow ([59afb78](https://github.com/wyre-technology/halopsa-mcp/commit/59afb78f4cfd8fb78576e0717ac938623bffabc4))

## [1.1.4](https://github.com/wyre-technology/halopsa-mcp/compare/v1.1.3...v1.1.4) (2026-02-23)


### Bug Fixes

* quote MCPB bundle filename to prevent shell glob expansion failure ([d1ec9db](https://github.com/wyre-technology/halopsa-mcp/commit/d1ec9db5d613dfec001826e84904c648e3fd3e08))
* regenerate package-lock.json to sync with package.json ([d389207](https://github.com/wyre-technology/halopsa-mcp/commit/d38920797a695d010f792cb172d555128d29ec6c))

## [1.1.3](https://github.com/wyre-technology/halopsa-mcp/compare/v1.1.2...v1.1.3) (2026-02-18)


### Bug Fixes

* **ci:** convert pack-mcpb.js to ESM imports ([8dad858](https://github.com/wyre-technology/halopsa-mcp/commit/8dad858ff1b66bc5e9836c32ed212706236a6415))

## [1.1.2](https://github.com/wyre-technology/halopsa-mcp/compare/v1.1.1...v1.1.2) (2026-02-18)


### Bug Fixes

* strip scope from MCPB bundle filename ([65c2a27](https://github.com/wyre-technology/halopsa-mcp/commit/65c2a27f4ad4f2b09674af4f36cbb1bd48fa9a93))

## [1.1.1](https://github.com/wyre-technology/halopsa-mcp/compare/v1.1.0...v1.1.1) (2026-02-18)


### Bug Fixes

* rename pack-mcpb.js to .cjs for ESM compatibility ([c722340](https://github.com/wyre-technology/halopsa-mcp/commit/c7223404a1d220880328b9b869acfaf4387e1e39))

# [1.1.0](https://github.com/wyre-technology/halopsa-mcp/compare/v1.0.0...v1.1.0) (2026-02-18)


### Bug Fixes

* **ci:** fix release workflow failures ([8292243](https://github.com/wyre-technology/halopsa-mcp/commit/829224386f0edc4f79771d4ffcd58a00af655416))
* **docker:** drop arm64 platform to fix QEMU build failures ([de206bc](https://github.com/wyre-technology/halopsa-mcp/commit/de206bccd2a93395bbd49dcda192b3c0bdecb5a6))
* use npm install instead of npm ci for lock file compatibility ([04d1882](https://github.com/wyre-technology/halopsa-mcp/commit/04d1882b4958c2021083f9e28ceebbb9fb564f4e))


### Features

* add MCPB bundle to release workflow ([6de2350](https://github.com/wyre-technology/halopsa-mcp/commit/6de2350901cfafe4f9a1ae8ecaf68788651770ea))
* add MCPB manifest for desktop installation ([f2b77ac](https://github.com/wyre-technology/halopsa-mcp/commit/f2b77acb65b62a78fd63d0837ea3c7f94cee079b))
* add MCPB pack script ([440ed6e](https://github.com/wyre-technology/halopsa-mcp/commit/440ed6e4b8e628f091b9d5cb53fbf3165d3edfc7))

# 1.0.0 (2026-02-17)


### Bug Fixes

* **ci:** replace release workflow with working Node 22+ version ([a06b5b3](https://github.com/wyre-technology/halopsa-mcp/commit/a06b5b3e94edf63fc00922f5ecb8b12f5a3d11ec))
* **ci:** revert release workflow to [@asachs01](https://github.com/asachs01) npm scope ([8fb04a6](https://github.com/wyre-technology/halopsa-mcp/commit/8fb04a65fdb165a5f78acf666238208179bdb451))
* **ci:** update .npmrc to use [@wyre-technology](https://github.com/wyre-technology) scope ([fa5a82b](https://github.com/wyre-technology/halopsa-mcp/commit/fa5a82ba1a4e0dc1d2b1592b167dfa6af9dcfc3f))
* **ci:** update Dockerfile to use ARG-based GitHub Packages auth ([d1997b4](https://github.com/wyre-technology/halopsa-mcp/commit/d1997b4fac6bf5476479c5d9fa0f51c3d4c9153c))
* **ci:** update node-halopsa dependency to [@wyre-technology](https://github.com/wyre-technology) scope ([2f5325d](https://github.com/wyre-technology/halopsa-mcp/commit/2f5325d08509e6c9c88f992aebe43caa6ff4b3b2))
* **config:** revert .npmrc to [@asachs01](https://github.com/asachs01) registry scope ([c616b87](https://github.com/wyre-technology/halopsa-mcp/commit/c616b87510577b0d05471404efeca927f42d663b))
* **deps:** add semantic-release plugins as devDependencies ([7593516](https://github.com/wyre-technology/halopsa-mcp/commit/7593516c589eea00c4a5a90c740e7f303ed97afb))
* **deps:** revert to @asachs01/node-halopsa package scope ([5456067](https://github.com/wyre-technology/halopsa-mcp/commit/54560674c800bb00f4dd5612c35139c22a6e95c9))
* escape newlines in .releaserc.json message template ([29069e3](https://github.com/wyre-technology/halopsa-mcp/commit/29069e3862ae1d58cf4f6534bb416b2078ced27b))
* regenerate package-lock.json with semantic-release deps ([2e97c61](https://github.com/wyre-technology/halopsa-mcp/commit/2e97c61bdb0f366ae0405c900e15efcbc8507327))


### Features

* add deploy infrastructure (docker-compose, DO, Cloudflare) and badges ([77133e0](https://github.com/wyre-technology/halopsa-mcp/commit/77133e07852fe79181585bc80bd61dcfee6f8000))
* add mcpb packaging support ([f4aa606](https://github.com/wyre-technology/halopsa-mcp/commit/f4aa6065835c978782d56db6f4f4911b9516670b))
* add mcpb packaging support ([ec1e067](https://github.com/wyre-technology/halopsa-mcp/commit/ec1e06710add15833e23721aeeb9dc127b70b85a))
* add mcpb packaging support ([9b47b4a](https://github.com/wyre-technology/halopsa-mcp/commit/9b47b4a7a9fb4c3a9ea0a7b39bf1c92fa6258c5e))
* add mcpb packaging support ([a130d1f](https://github.com/wyre-technology/halopsa-mcp/commit/a130d1f23e33bb19efd75c25bc44a650f2348848))
* add mcpb packaging support ([325052a](https://github.com/wyre-technology/halopsa-mcp/commit/325052abf8cbbf612a8d006fecaf34d918c91683))
* Implement decision tree architecture for HaloPSA MCP server ([7845fdf](https://github.com/wyre-technology/halopsa-mcp/commit/7845fdff187090dafb585bd61244caf47132706a))
