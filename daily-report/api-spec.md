# 영업 일일 보고 시스템 API 명세서

`requirements.md`(ER 다이어그램), `screens.md`(화면 정의서)를 기준으로 작성한 REST API 명세서.

## 1. 공통 사항

- **Base URL**: `/api`
- **인증 방식**: 로그인 시 발급된 Bearer 토큰을 `Authorization` 헤더에 포함
  - `Authorization: Bearer {token}`
- **Content-Type**: `application/json`
- **날짜/시간 포맷**: 날짜 `YYYY-MM-DD`, 일시 `YYYY-MM-DDTHH:mm:ssZ` (ISO 8601)

### 1.1 공통 응답 포맷

성공:
```json
{
  "success": true,
  "data": { },
  "error": null
}
```

실패:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "필수 항목이 누락되었습니다."
  }
}
```

### 1.2 공통 에러 코드

| HTTP 상태 | code | 설명 |
|---|---|---|
| 400 | VALIDATION_ERROR | 요청 값 검증 실패 |
| 401 | UNAUTHORIZED | 인증 실패/토큰 없음 |
| 403 | FORBIDDEN | 권한 없음 |
| 404 | NOT_FOUND | 대상 리소스 없음 |
| 409 | CONFLICT | 중복(예: 동일 사원+동일 날짜 보고 중복) |
| 500 | INTERNAL_ERROR | 서버 오류 |

### 1.3 권한 구분

| 구분 | 설명 |
|---|---|
| ALL | 로그인한 모든 사용자 |
| SALES | 영업사원 본인 |
| MANAGER | 해당 영업사원의 상급자(`manager_id` 체인) |
| ADMIN | 관리자 (마스터 등록/수정/삭제) |

## 2. API 목록

| 그룹 | Method | URL | 설명 | 권한 |
|---|---|---|---|---|
| 인증 | POST | `/api/auth/login` | 로그인 | ALL |
| 인증 | POST | `/api/auth/logout` | 로그아웃 | ALL |
| 영업사원 | GET | `/api/employees` | 영업사원 목록 조회 | ALL |
| 영업사원 | GET | `/api/employees/{employee_id}` | 영업사원 상세 조회 | ALL |
| 영업사원 | POST | `/api/employees` | 영업사원 등록 | ADMIN |
| 영업사원 | PUT | `/api/employees/{employee_id}` | 영업사원 수정 | ADMIN |
| 영업사원 | DELETE | `/api/employees/{employee_id}` | 영업사원 삭제 | ADMIN |
| 고객 | GET | `/api/customers` | 고객 목록 조회 | ALL |
| 고객 | GET | `/api/customers/{customer_id}` | 고객 상세 조회 | ALL |
| 고객 | POST | `/api/customers` | 고객 등록 | ADMIN |
| 고객 | PUT | `/api/customers/{customer_id}` | 고객 수정 | ADMIN |
| 고객 | DELETE | `/api/customers/{customer_id}` | 고객 삭제 | ADMIN |
| 일일 보고 | GET | `/api/reports` | 일일 보고 목록 조회 | SALES, MANAGER |
| 일일 보고 | GET | `/api/reports/{report_id}` | 일일 보고 상세 조회 (방문내역/댓글 포함) | SALES, MANAGER |
| 일일 보고 | POST | `/api/reports` | 일일 보고 등록 (방문내역 포함) | SALES |
| 일일 보고 | PUT | `/api/reports/{report_id}` | 일일 보고 수정 (방문내역 포함) | SALES(본인) |
| 일일 보고 | DELETE | `/api/reports/{report_id}` | 일일 보고 삭제 | SALES(본인) |
| 댓글 | GET | `/api/reports/{report_id}/comments` | 댓글 목록 조회 | SALES, MANAGER |
| 댓글 | POST | `/api/reports/{report_id}/comments` | 댓글 등록 | MANAGER |
| 댓글 | DELETE | `/api/comments/{comment_id}` | 댓글 삭제 | MANAGER(작성자 본인) |

## 3. 상세 명세

### 3.1 인증

#### POST /api/auth/login

로그인 후 토큰 발급.

**Request Body**
```json
{
  "employee_id": "E1001",
  "password": "string"
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "employee": {
      "employee_id": "E1001",
      "name": "홍길동",
      "department": "영업1팀",
      "position": "대리",
      "manager_id": "E1000"
    }
  },
  "error": null
}
```

**에러**: 401 UNAUTHORIZED (사번/비밀번호 불일치)

---

#### POST /api/auth/logout

**Response 200**
```json
{ "success": true, "data": null, "error": null }
```

---

### 3.2 영업사원 마스터

#### GET /api/employees

**Query Parameters**

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| keyword | string | N | 이름/부서 부분 일치 검색 |
| page | int | N | 기본값 1 |
| size | int | N | 기본값 20 |

**Response 200**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "employee_id": "E1001",
        "name": "홍길동",
        "department": "영업1팀",
        "position": "대리",
        "manager_id": "E1000",
        "manager_name": "김부장",
        "hire_date": "2022-03-02"
      }
    ],
    "total": 1
  },
  "error": null
}
```

#### GET /api/employees/{employee_id}

**Response 200**: 위 목록 항목과 동일한 단건 객체를 `data`에 반환

#### POST /api/employees

**Request Body**
```json
{
  "name": "홍길동",
  "department": "영업1팀",
  "position": "대리",
  "manager_id": "E1000",
  "hire_date": "2022-03-02"
}
```

**Response 201**: 생성된 영업사원 객체 (`employee_id` 포함)

#### PUT /api/employees/{employee_id}

**Request Body**: POST와 동일한 필드 (부분 수정 시 변경 항목만 전달 가능)

**Response 200**: 수정된 영업사원 객체

**에러**: 400 VALIDATION_ERROR (`manager_id`가 자기 자신인 경우)

#### DELETE /api/employees/{employee_id}

**Response 200**
```json
{ "success": true, "data": null, "error": null }
```

**에러**: 409 CONFLICT (해당 사원 명의의 `DAILY_REPORT`가 존재하는 경우 삭제 불가, 또는 하급자가 있는 경우)

---

### 3.3 고객 마스터

#### GET /api/customers

**Query Parameters**

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| keyword | string | N | 회사명/담당자명 부분 일치 검색 |
| sales_rep_id | string | N | 담당 영업사원 필터 |
| page / size | int | N | 페이징 |

**Response 200**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "customer_id": "C2001",
        "company_name": "㈜테스트상사",
        "contact_name": "이철수",
        "phone": "02-1234-5678",
        "address": "서울시 강남구 ...",
        "sales_rep_id": "E1001",
        "sales_rep_name": "홍길동"
      }
    ],
    "total": 1
  },
  "error": null
}
```

#### GET /api/customers/{customer_id}

**Response 200**: 단건 객체

#### POST /api/customers

**Request Body**
```json
{
  "company_name": "㈜테스트상사",
  "contact_name": "이철수",
  "phone": "02-1234-5678",
  "address": "서울시 강남구 ...",
  "sales_rep_id": "E1001"
}
```

**Response 201**: 생성된 고객 객체 (`customer_id` 포함)

#### PUT /api/customers/{customer_id}

**Request Body**: POST와 동일

**Response 200**: 수정된 고객 객체

#### DELETE /api/customers/{customer_id}

**Response 200**
```json
{ "success": true, "data": null, "error": null }
```

**에러**: 409 CONFLICT (해당 고객의 `VISIT_RECORD`가 존재하는 경우 삭제 불가)

---

### 3.4 일일 보고

#### GET /api/reports

**Query Parameters**

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| employee_id | string | N | 미지정 시 로그인 사용자 본인 기준 (MANAGER는 하급자 전체) |
| start_date | date | N | 조회 시작일 |
| end_date | date | N | 조회 종료일 |
| page / size | int | N | 페이징 |

**Response 200**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "report_id": "R30001",
        "employee_id": "E1001",
        "employee_name": "홍길동",
        "report_date": "2026-09-02",
        "visit_count": 3,
        "comment_count": 1,
        "created_at": "2026-09-02T18:30:00Z"
      }
    ],
    "total": 1
  },
  "error": null
}
```

#### GET /api/reports/{report_id}

방문 내역, 댓글을 포함한 상세 조회.

**Response 200**
```json
{
  "success": true,
  "data": {
    "report_id": "R30001",
    "employee_id": "E1001",
    "employee_name": "홍길동",
    "report_date": "2026-09-02",
    "problem": "A사 견적 승인 지연",
    "plan": "B사 재방문, 견적서 재발송",
    "visit_records": [
      {
        "visit_id": "V40001",
        "customer_id": "C2001",
        "customer_name": "㈜테스트상사",
        "visit_content": "신규 계약 조건 협의",
        "sequence": 1
      }
    ],
    "comments": [
      {
        "comment_id": "M50001",
        "author_id": "E1000",
        "author_name": "김부장",
        "content": "A사 건은 내일 같이 확인해봅시다.",
        "created_at": "2026-09-02T19:00:00Z"
      }
    ],
    "created_at": "2026-09-02T18:30:00Z",
    "updated_at": "2026-09-02T18:30:00Z"
  },
  "error": null
}
```

**에러**: 403 FORBIDDEN (본인/하급자 보고가 아닌 경우), 404 NOT_FOUND

#### POST /api/reports

방문 내역을 포함하여 일일 보고를 등록한다. 방문 내역은 최소 1건 이상이어야 한다.

**Request Body**
```json
{
  "report_date": "2026-09-02",
  "problem": "A사 견적 승인 지연",
  "plan": "B사 재방문, 견적서 재발송",
  "visit_records": [
    {
      "customer_id": "C2001",
      "visit_content": "신규 계약 조건 협의",
      "sequence": 1
    }
  ]
}
```

**Response 201**: 3.4 GET 상세 조회와 동일한 형태의 생성된 보고 객체

**에러**
- 400 VALIDATION_ERROR: `visit_records`가 비어있는 경우
- 409 CONFLICT: 동일 `employee_id` + `report_date` 보고가 이미 존재하는 경우

#### PUT /api/reports/{report_id}

`visit_records`는 전달된 배열로 전체 교체(replace)된다.

**Request Body**: POST와 동일한 형태 (`report_date` 변경 불가, `problem`/`plan`/`visit_records`만 수정)

**Response 200**: 수정된 보고 상세 객체

**에러**: 403 FORBIDDEN (작성자 본인이 아닌 경우)

#### DELETE /api/reports/{report_id}

**Response 200**
```json
{ "success": true, "data": null, "error": null }
```

**에러**: 403 FORBIDDEN (작성자 본인이 아닌 경우)

---

### 3.5 댓글

#### GET /api/reports/{report_id}/comments

**Response 200**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "comment_id": "M50001",
        "report_id": "R30001",
        "author_id": "E1000",
        "author_name": "김부장",
        "content": "A사 건은 내일 같이 확인해봅시다.",
        "created_at": "2026-09-02T19:00:00Z"
      }
    ],
    "total": 1
  },
  "error": null
}
```

#### POST /api/reports/{report_id}/comments

**Request Body**
```json
{
  "content": "A사 건은 내일 같이 확인해봅시다."
}
```

**Response 201**: 생성된 댓글 객체

**에러**: 403 FORBIDDEN (해당 보고 작성자의 상급자가 아닌 경우)

#### DELETE /api/comments/{comment_id}

**Response 200**
```json
{ "success": true, "data": null, "error": null }
```

**에러**: 403 FORBIDDEN (댓글 작성자 본인이 아닌 경우)
