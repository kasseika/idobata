## ショートカット（自分のよく使うものを登録すると便利）
default: containers-start
.PHONY: lint format test
lint: frontend-lint idea-discussion-backend-lint admin-lint
format: frontend-format idea-discussion-backend-format admin-format
test: frontend-test idea-discussion-backend-test admin-test

# ターゲット定義（makefile は薄いラッパーとして使う。複雑な処理を書かずシンプルに保つこと）
containers-start:
	docker compose up

containers-stop:
	docker compose down

idea-discussion-containers-start:
	docker compose up frontend idea-backend mongo admin

idea-discussion-containers-build:
	docker compose up frontend idea-backend mongo admin --build

frontend-lint:
	cd frontend && npm run lint

frontend-format:
	cd frontend && npm run format

frontend-test:
	cd frontend && npm run test

idea-discussion-backend-lint:
	cd idea-discussion/backend && npm run lint

idea-discussion-backend-format:
	cd idea-discussion/backend && npm run format

idea-discussion-backend-test:
	cd idea-discussion/backend && npm run test

# Admin panel commands
admin-containers-start:
	docker compose up admin

admin-lint:
	cd admin && npm run lint

admin-format:
	cd admin && npm run format

admin-test:
	cd admin && npm run test

admin-build:
	cd admin && npm run build
