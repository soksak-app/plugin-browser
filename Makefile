# browser plugin repository 의 test 와 pack(docs/features.md). pack 은 core 의 sok 를 쓴다.
.PHONY: test check pack push-check hooks

SOK ?= sok
# DIAGNOSTICS=1 이면 diagnostics.json 을 담은 진단 package 를 쓴다.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# test 는 package.json 이 정한 core commit 의 @soksak/plugin-api 를 쓴다.
node_modules: package.json
	pnpm install
	touch node_modules

# test runs only the tests of this plugin, over fakes of the core side.
test: node_modules
	pnpm test

# check runs the SDK validators of the pinned @soksak/plugin-api, or of the packages/plugin-api source of core when
# CORE_PLUGIN_API_DIR names it (README.md). scripts/check-manifest.mjs validates plugin.json with validateManifest.
# soksak-exposure checks the public names of the page and the section sources against plugin.json and the core declarations,
# soksak-engines checks that engines.soksak admits the release of that @soksak/plugin-api, soksak-events counts the records
# missing from the sources and matches events.json with the emit sites, and soksak-records checks the records.
SDK_EXPOSURE = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/exposure-check.js,pnpm exec soksak-exposure)
SDK_ENGINES = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/engines-check.js,pnpm exec soksak-engines)
SDK_EVENTS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/events-check.js,pnpm exec soksak-events)
SDK_RECORDS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/records-check.js,pnpm exec soksak-records)
check: node_modules
	node scripts/check-manifest.mjs
	$(SDK_EXPOSURE)
	$(SDK_ENGINES)
	$(SDK_EVENTS) --census census.json --catalog events.json
	$(SDK_RECORDS)
	node scripts/check-test-cases.mjs

pack:
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# The checks of the ci workflow that a push needs: make test, make check, and the commit messages of the pushed range.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
push-check: test check
	pnpm exec soksak-commits "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
