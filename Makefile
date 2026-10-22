# browser plugin repository 의 test 와 pack(docs/features.md). pack 은 core 의 sok 를 쓴다.
.PHONY: test check pack hooks

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

# check runs the SDK validators of the pinned @soksak/plugin-api: soksak-exposure checks the public names of the page and the
# section sources against plugin.json and the core declarations, soksak-engines checks that engines.soksak admits the
# release of that @soksak/plugin-api, soksak-events counts the records missing from the sources and matches events.json
# with the emit sites, and soksak-records checks the records.
check: node_modules
	pnpm exec soksak-exposure
	pnpm exec soksak-engines
	pnpm exec soksak-events --census census.json --catalog events.json
	pnpm exec soksak-records
	node scripts/check-test-cases.mjs

pack:
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
