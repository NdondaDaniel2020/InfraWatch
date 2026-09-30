# Domain-Driven Design (DDD) — Guia Completo

## 1. O que é Domain-Driven Design?

**Domain-Driven Design (DDD)** é uma abordagem de desenvolvimento de software criada por **Eric Evans** para construir sistemas complexos colocando o **domínio de negócio** no centro da arquitetura.

A ideia principal é:

> O software deve refletir os conceitos, regras e processos reais do negócio.

DDD não é um framework nem uma tecnologia específica. Pode ser usado com Python, Java, C#, TypeScript, Go, FastAPI, Django, Spring, PostgreSQL etc.

O foco é organizar o software de forma que o código represente o negócio com clareza.

---

# 2. O que é Domínio?

O **domínio** é a área de negócio que o sistema resolve.

Exemplos:

| Sistema | Domínio |
|---|---|
| Banco | Contas, transferências, empréstimos |
| Hospital | Pacientes, consultas, médicos |
| E-commerce | Produtos, carrinho, pedidos |
| Escola | Alunos, notas, turmas, pagamentos |
| InfraWatch | Dispositivos, monitoramento, métricas, alertas |

No InfraWatch, o domínio não é FastAPI, PostgreSQL ou Redis.

O domínio é formado pelos conceitos de negócio, como:

- Device
- Alert
- Metric
- Monitoring
- Network Interface
- SNMP
- Endpoint
- Notification

Tecnologias como PostgreSQL e Redis pertencem à infraestrutura.

---

# 3. Objetivos do DDD

DDD procura:

- Organizar regras de negócio
- Tornar o código mais próximo da realidade do negócio
- Evitar regras espalhadas pelo sistema
- Facilitar manutenção
- Facilitar testes
- Reduzir acoplamento
- Criar limites claros entre partes do sistema
- Facilitar evolução do sistema
- Permitir que equipes trabalhem em partes diferentes do domínio

DDD é especialmente útil quando o sistema possui muitas regras e processos de negócio.

---

# 4. Linguagem Ubíqua (Ubiquitous Language)

A **Linguagem Ubíqua** é uma linguagem comum usada por desenvolvedores e especialistas do negócio.

O objetivo é que todos usem os mesmos termos.

Exemplo ruim:

```python
class Data:
    pass
```

O termo `Data` não explica o que representa.

Exemplo melhor:

```python
class Device:
    pass
```

Outros exemplos:

```python
class Alert:
    pass

class Notification:
    pass

class Transfer:
    pass
```

Os nomes devem representar conceitos reais do domínio.

A Linguagem Ubíqua aparece:

- no código
- nas entidades
- nos casos de uso
- nos eventos
- na documentação
- nas conversas da equipe
- nos testes

---

# 5. Arquitetura em Camadas

Uma arquitetura frequentemente utilizada com DDD é:

```text
Presentation
      ↓
Application
      ↓
Domain
      ↑
Infrastructure
```

O princípio importante é que o **Domain não deve depender de detalhes de infraestrutura**.

Uma divisão comum:

```text
src/

├── domain/
├── application/
├── infrastructure/
└── presentation/
```

---

# 6. Presentation Layer

A camada de apresentação lida com a entrada e saída do sistema.

Em uma API:

```python
@router.post("/devices")
def create_device():
    ...
```

Responsabilidades:

- HTTP
- JSON
- Controllers
- Routers
- Serialização
- Autenticação HTTP
- Status codes

A Presentation não deveria conter regras complexas do negócio.

Ela recebe a requisição e chama um caso de uso.

---

# 7. Application Layer

A Application Layer coordena **casos de uso**.

Exemplos:

```text
CreateDevice
DeleteDevice
MonitorDevice
GenerateAlert
AcknowledgeAlert
```

Um caso de uso pode:

1. Receber dados
2. Buscar entidades
3. Executar operações do domínio
4. Salvar através de repositories
5. Publicar eventos

Exemplo conceitual:

```python
class CreateDeviceUseCase:

    def execute(self, data):
        device = Device.create(...)
        self.repository.save(device)
        return device
```

A Application Layer coordena o fluxo, mas não deve virar um lugar para colocar todas as regras de negócio.

---

# 8. Domain Layer

A Domain Layer é o coração do sistema.

Ela contém conceitos e regras de negócio.

Pode conter:

- Entities
- Value Objects
- Aggregates
- Aggregate Roots
- Domain Services
- Domain Events
- Repository interfaces
- Factories
- Specifications

O Domain deve ser independente de detalhes como:

- PostgreSQL
- Redis
- RabbitMQ
- FastAPI
- Django ORM
- HTTP clients

---

# 9. Infrastructure Layer

A Infrastructure Layer contém implementações técnicas.

Exemplos:

```text
PostgreSQL
Redis
RabbitMQ
SNMP
APIs externas
ORM
File system
SMTP
```

Por exemplo, o domínio pode definir:

```python
class DeviceRepository:
    def save(self, device):
        ...
```

A infraestrutura implementa:

```python
class PostgresDeviceRepository(DeviceRepository):
    def save(self, device):
        ...
```

Assim, o domínio não precisa saber como o PostgreSQL funciona.

---

# 10. Entities

Uma **Entity** é um objeto que possui identidade própria.

Exemplo:

```python
class Device:
    id: UUID
    hostname: str
    ip: str
```

Se o hostname mudar:

```text
Router-01
```

para:

```text
Core-Router
```

continua sendo o mesmo Device.

Sua identidade é determinada pelo ID.

---

# 11. Value Objects

Um **Value Object** não possui identidade própria.

Ele é definido pelo seu valor.

Exemplo:

```python
class IpAddress:
    value: str
```

Dois objetos:

```python
IpAddress("192.168.1.1")
IpAddress("192.168.1.1")
```

representam o mesmo valor.

Exemplos comuns:

- Email
- IP Address
- Money
- Percentage
- Coordinates
- Phone Number
- Date Range

Value Objects são úteis para encapsular validações e regras relacionadas a valores.

---

# 12. Aggregate

Um **Aggregate** é um conjunto de objetos do domínio tratados como uma unidade.

Exemplo:

```text
Device
├── Interface
├── Metric
└── Alert
```

Um Aggregate possui uma fronteira.

Essa fronteira define quais objetos pertencem àquela unidade e como eles podem ser modificados.

---

# 13. Aggregate Root

O **Aggregate Root** é a entidade principal que controla o Aggregate.

Por exemplo:

```text
Device
├── Interface
├── Metric
└── Alert
```

Nesse exemplo:

```text
Device = Aggregate Root
```

A ideia é que alterações relevantes passem pelo Aggregate Root.

Em vez de manipular diretamente uma parte interna:

```python
metric.cpu = 95
```

pode-se fazer:

```python
device.update_metric(cpu=95)
```

Assim, o próprio domínio pode garantir suas invariantes.

---

# 14. Invariants

Uma **invariant** é uma regra que deve sempre ser verdadeira dentro do domínio.

Exemplo:

```text
Um dispositivo não pode ter duas interfaces com o mesmo identificador.
```

Ou:

```text
Uma conta não pode ter saldo negativo.
```

A entidade ou aggregate deve proteger essas regras.

Exemplo:

```python
class Account:

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientBalance()

        self.balance -= amount
```

O objetivo é impedir que o sistema entre em um estado inválido.

---

# 15. Repository

Um **Repository** abstrai a persistência de entidades.

O domínio pode definir uma interface:

```python
class DeviceRepository:

    def save(self, device):
        ...

    def find_by_id(self, device_id):
        ...
```

A infraestrutura implementa:

```python
class PostgresDeviceRepository(DeviceRepository):

    def save(self, device):
        ...
```

Benefício:

```text
Domain
  ↓
DeviceRepository
  ↑
PostgresDeviceRepository
```

O domínio conhece a abstração, não o PostgreSQL.

---

# 16. Domain Services

Um **Domain Service** contém uma regra de negócio que não pertence naturalmente a uma única Entity ou Value Object.

Exemplo:

```python
class AlertEvaluator:

    def should_trigger(self, metric, rule):
        ...
```

Pode ser útil quando a regra envolve vários objetos.

Importante: não transformar todo código de negócio em Service.

Se uma regra pertence claramente a uma entidade, normalmente é melhor colocá-la na própria entidade.

---

# 17. Application Services

Um **Application Service** coordena casos de uso.

Exemplo:

```python
class CreateDeviceUseCase:

    def execute(self, data):
        device = Device.create(data)
        self.repository.save(device)
        return device
```

Ele pode chamar:

- entidades
- domain services
- repositories
- event bus

Mas sua principal responsabilidade é coordenar o fluxo da aplicação.

---

# 18. Factory

Uma **Factory** encapsula a criação de objetos complexos.

Exemplo:

```python
device = DeviceFactory.create_snmp_device(...)
```

É útil quando criar uma entidade exige:

- várias validações
- criação de Value Objects
- configuração inicial
- criação de objetos relacionados

---

# 19. Domain Events

Um **Domain Event** representa algo importante que aconteceu no domínio.

Exemplos:

```text
DeviceRegistered
DeviceOffline
AlertTriggered
AlertResolved
PaymentCompleted
OrderCreated
```

Exemplo:

```text
Device
  ↓
fica OFFLINE
  ↓
DeviceOffline
```

O evento pode ser utilizado por outras partes do sistema.

---

# 20. Event Bus

Um Event Bus distribui eventos para seus consumidores.

Exemplo:

```text
DeviceOffline
       ↓
    Event Bus
       ↓
 ┌─────┴────────┐
 ↓              ↓
Alert       Monitoring
Context      Context
```

Em sistemas maiores, o Event Bus pode ser implementado usando tecnologias como:

- RabbitMQ
- Kafka
- Redis Streams
- outros brokers

---

# 21. Bounded Context

**Bounded Context** é uma das ideias mais importantes do DDD.

Um Bounded Context é uma **fronteira dentro da qual um modelo de domínio possui um significado específico**.

A mesma palavra pode ter significados e modelos diferentes em contextos diferentes.

---

## Exemplo: Escola

Imagine um sistema escolar.

A palavra:

```text
Aluno
```

parece simples, mas pode significar coisas diferentes.

### Academic Context

```text
Student
├── nome
├── turma
├── notas
└── faltas
```

Aqui o aluno existe para representar informações acadêmicas.

### Financial Context

```text
Student
├── nome
├── propina
├── dívida
└── pagamentos
```

Aqui o aluno existe para representar informações financeiras.

Os dois representam a mesma pessoa no mundo real, mas são modelos diferentes dentro do software.

Portanto:

```text
Academic Context
    └── Student

Financial Context
    └── Student
```

Isso é perfeitamente válido em DDD.

---

# 22. Outro exemplo: E-commerce

Considere um e-commerce.

A palavra:

```text
Product
```

pode aparecer em vários contextos.

### Catalog Context

```text
Product
├── name
├── description
├── images
└── categories
```

### Inventory Context

```text
Product
├── quantity
├── warehouse
└── stock_status
```

### Sales Context

```text
Product
├── price
├── discount
└── tax
```

É o mesmo produto físico, mas cada contexto precisa de informações diferentes.

Não é necessário criar uma única classe gigante:

```python
class Product:
    name
    description
    images
    quantity
    warehouse
    price
    discount
    tax
    ...
```

Isso aumenta o acoplamento.

---

# 23. Outro exemplo: Banco

A palavra:

```text
Customer
```

pode existir em vários contextos.

### Customer Management

```text
Customer
├── name
├── document
└── phone
```

### Credit

```text
Customer
├── credit_score
├── risk
└── credit_limit
```

### Support

```text
Customer
├── tickets
├── complaints
└── interactions
```

Cada contexto possui seu próprio modelo.

---

# 24. Bounded Context no InfraWatch

O InfraWatch pode ser dividido em diferentes contextos.

Por exemplo:

```text
Inventory Context
Monitoring Context
Alert Context
Notification Context
Authentication Context
Reporting Context
```

---

## Inventory Context

Responsável por:

- cadastrar dispositivos
- remover dispositivos
- atualizar dispositivos
- grupos
- localização
- informações do equipamento

Modelo:

```text
Device
├── hostname
├── ip
├── vendor
├── model
└── serial
```

---

## Monitoring Context

Responsável por:

- monitoramento
- SNMP
- CPU
- memória
- disco
- uptime
- interfaces

Modelo:

```text
Device
├── status
├── uptime
├── cpu
├── memory
└── interfaces
```

Observe que existe `Device` nos dois contextos.

Eles não precisam ser a mesma classe.

---

## Alert Context

Responsável por:

- regras de alerta
- thresholds
- criação de alertas
- resolução de alertas

Modelo:

```text
Alert
AlertRule
Threshold
```

Exemplo:

```text
CPU > 90%
```

pode gerar:

```text
HighCpuDetected
```

e posteriormente:

```text
AlertTriggered
```

---

## Notification Context

Responsável por:

- email
- SMS
- Telegram
- outros canais

Modelo:

```text
Notification
Channel
Message
Template
```

---

# 25. Comunicação entre Bounded Contexts

Os contextos podem se comunicar através de:

- APIs
- eventos
- mensagens
- filas
- comandos

Exemplo:

```text
Inventory
    ↓
DeviceRegistered
    ↓
Monitoring
```

Depois:

```text
Monitoring
    ↓
HighCpuDetected
    ↓
Alert
```

Depois:

```text
Alert
    ↓
AlertTriggered
    ↓
Notification
```

Fluxo:

```text
Inventory
    │
    │ DeviceRegistered
    ↓
Monitoring
    │
    │ HighCpuDetected
    ↓
Alert
    │
    │ AlertTriggered
    ↓
Notification
```

Esse modelo combina muito bem com mensageria e arquitetura de microserviços.

---

# 26. Context Map

Um **Context Map** representa como os Bounded Contexts se relacionam.

Exemplo:

```text
┌──────────────┐
│  Inventory   │
└──────┬───────┘
       │
       │ DeviceRegistered
       ↓
┌──────────────┐
│  Monitoring  │
└──────┬───────┘
       │
       │ HighCpuDetected
       ↓
┌──────────────┐
│    Alert     │
└──────┬───────┘
       │
       │ AlertTriggered
       ↓
┌──────────────┐
│ Notification │
└──────────────┘
```

Ele ajuda a visualizar dependências e integrações entre contextos.

---

# 27. Anti-Corruption Layer (ACL)

Um **Anti-Corruption Layer** protege o modelo interno de um sistema externo.

Exemplo:

```text
External SNMP/Vendor API
          ↓
         ACL
          ↓
      Domain Model
```

O sistema externo pode retornar:

```json
{
    "device_name": "R01",
    "cpu_load": 95,
    "mem_used": 82
}
```

Mas o domínio pode querer:

```python
DeviceMetrics(
    cpu=95,
    memory=82
)
```

A ACL faz a tradução.

Isso evita contaminar o domínio com modelos específicos de fornecedores ou APIs externas.

---

# 28. Specification Pattern

Uma **Specification** representa uma regra que pode ser reutilizada.

Exemplo:

```python
class DeviceIsOnline:
    def is_satisfied_by(self, device):
        return device.status == "ONLINE"
```

Outra:

```python
class CpuAboveThreshold:
    def is_satisfied_by(self, metric):
        return metric.cpu > 90
```

Pode ser útil para regras complexas e combináveis.

---

# 29. CQRS

**CQRS (Command Query Responsibility Segregation)** separa operações que modificam o estado das operações que apenas consultam.

### Commands

Alteram dados:

```text
CreateDevice
DeleteDevice
UpdateDevice
AcknowledgeAlert
```

### Queries

Consultam dados:

```text
GetDevice
ListDevices
GetAlerts
GetDeviceMetrics
```

A separação pode ser simples dentro da mesma aplicação ou evoluir para arquiteturas mais complexas.

DDD e CQRS podem ser usados juntos, mas **CQRS não é obrigatório para usar DDD**.

---

# 30. DDD e Microservices

DDD pode ajudar a descobrir limites para microserviços.

Por exemplo:

```text
Inventory Context
       ↓
inventory-service

Monitoring Context
       ↓
monitoring-service

Alert Context
       ↓
alert-service

Notification Context
       ↓
notification-service
```

Mas:

> Bounded Context não significa automaticamente Microservice.

Um Bounded Context pode existir dentro de um **monólito modular**.

Exemplo:

```text
Monolith
│
├── Inventory Context
├── Monitoring Context
├── Alert Context
└── Notification Context
```

Mais tarde, se fizer sentido:

```text
Inventory → Service
Monitoring → Service
Alert → Service
Notification → Service
```

Isso permite evoluir gradualmente.

---

# 31. DDD Estratégico vs DDD Tático

DDD possui duas grandes áreas.

## Strategic Design

Foca na organização do domínio:

- Domain
- Subdomains
- Bounded Contexts
- Ubiquitous Language
- Context Maps
- relações entre contextos

## Tactical Design

Foca na implementação do domínio:

- Entities
- Value Objects
- Aggregates
- Aggregate Roots
- Repositories
- Domain Services
- Domain Events
- Factories
- Specifications

Uma forma de lembrar:

```text
Strategic DDD
    ↓
"Como dividir o negócio?"

Tactical DDD
    ↓
"Como modelar cada parte?"
```

---

# 32. Subdomains

Um **Subdomain** é uma parte do domínio maior do negócio.

Exemplo: e-commerce.

```text
E-commerce
├── Catalog
├── Inventory
├── Orders
├── Payments
├── Shipping
└── Notifications
```

Os subdomínios podem ser classificados como:

### Core Domain

Parte principal que diferencia o negócio.

### Supporting Subdomain

Importante para o negócio, mas não é o principal diferencial.

### Generic Subdomain

Funcionalidade comum que pode ser comprada ou reutilizada.

Exemplo:

```text
Core:
    Monitoring Intelligence

Supporting:
    Reporting

Generic:
    Authentication
```

A classificação depende do negócio.

---

# 33. Core Domain

O **Core Domain** é a parte mais importante e estratégica do negócio.

É onde normalmente vale mais a pena investir em:

- conhecimento do domínio
- modelagem
- testes
- qualidade
- arquitetura

No InfraWatch, dependendo do objetivo do produto, uma possível área core seria:

```text
Monitoring + Alert Intelligence
```

porque é aí que pode estar o diferencial do sistema.

---

# 34. Exemplo completo

Imagine o seguinte fluxo:

```text
Um administrador cadastra um router.
```

### Inventory Context

Cria:

```text
DeviceRegistered
```

---

### Monitoring Context

Recebe o evento.

Começa a monitorar:

```text
CPU
RAM
Disk
Network
Uptime
```

---

### Monitoring

Detecta:

```text
CPU = 95%
```

Gera:

```text
HighCpuDetected
```

---

### Alert Context

Avalia:

```text
CPU > 90%
```

Cria:

```text
AlertTriggered
```

---

### Notification Context

Recebe:

```text
AlertTriggered
```

Envia:

```text
Email
Telegram
```

Arquiteturalmente:

```text
┌────────────┐
│ Inventory  │
└─────┬──────┘
      │ DeviceRegistered
      ↓
┌────────────┐
│ Monitoring │
└─────┬──────┘
      │ HighCpuDetected
      ↓
┌────────────┐
│   Alert    │
└─────┬──────┘
      │ AlertTriggered
      ↓
┌──────────────┐
│ Notification │
└──────────────┘
```

---

# 35. Estrutura de projeto DDD

Uma estrutura possível:

```text
src/

├── domain/
│   ├── device/
│   │   ├── entities/
│   │   ├── value_objects/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── events/
│   │   └── factories/
│   │
│   ├── alert/
│   └── monitoring/
│
├── application/
│   ├── use_cases/
│   ├── commands/
│   └── queries/
│
├── infrastructure/
│   ├── database/
│   ├── repositories/
│   ├── redis/
│   ├── rabbitmq/
│   └── snmp/
│
└── presentation/
    ├── api/
    └── routers/
```

Uma alternativa, especialmente quando existem Bounded Contexts claros:

```text
src/

├── contexts/
│   ├── inventory/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── monitoring/
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │
│   ├── alert/
│   └── notification/
│
└── shared/
```

Essa segunda abordagem é especialmente interessante para **Monólitos Modulares** e futuros microserviços.

---

# 36. DDD não significa criar classes para tudo

Um erro comum é pensar:

```text
DDD =
Entity
Repository
Service
Factory
Event
```

em todos os módulos.

Não.

DDD é principalmente uma forma de **modelar o negócio**.

Não devemos criar abstrações apenas por obrigação.

Se algo é simples, pode continuar simples.

---

# 37. DDD não é uma arquitetura específica

DDD pode ser combinado com:

```text
DDD
 ├── Clean Architecture
 ├── Hexagonal Architecture
 ├── Onion Architecture
 ├── Microservices
 ├── Modular Monolith
 ├── CQRS
 └── Event-Driven Architecture
```

São conceitos diferentes que podem trabalhar juntos.

Por exemplo:

```text
DDD
+
Clean Architecture
+
CQRS
+
RabbitMQ
+
Microservices
```

é uma combinação possível, mas não obrigatória.

---

# 38. Quando usar DDD?

DDD é especialmente útil quando:

- o sistema possui regras de negócio complexas
- existem muitos conceitos relacionados
- diferentes equipes trabalham em áreas diferentes
- o sistema precisa evoluir por muito tempo
- existem diferentes áreas de negócio
- existe alto risco de acoplamento

Exemplos:

- Bancos
- ERPs
- Hospitais
- E-commerce
- Sistemas de logística
- Sistemas de monitoramento
- Plataformas financeiras

---

# 39. Quando evitar DDD pesado?

Para uma API simples:

```text
POST /users
GET /users
DELETE /users
```

com poucas regras, criar:

```text
Entity
Aggregate
Factory
Domain Service
Specification
Domain Event
Repository
```

para cada operação pode ser exagero.

DDD deve ser aplicado de forma proporcional à complexidade do domínio.

---

# 40. Resumo mental

Uma forma simples de memorizar:

```text
DOMAIN
  │
  ├── O que o negócio faz?
  │
  ├── Entity
  │     └── objeto com identidade
  │
  ├── Value Object
  │     └── objeto definido pelo valor
  │
  ├── Aggregate
  │     └── grupo de objetos tratados como unidade
  │
  ├── Aggregate Root
  │     └── porta de entrada do Aggregate
  │
  ├── Domain Service
  │     └── regra que não pertence a uma entidade
  │
  ├── Domain Event
  │     └── algo importante aconteceu
  │
  └── Repository
        └── abstração da persistência
```

E no nível estratégico:

```text
DOMAIN
  │
  ├── Subdomains
  │
  ├── Bounded Contexts
  │
  ├── Ubiquitous Language
  │
  └── Context Map
```

---

# 41. O mais importante para um Backend Developer

Se estiveres aprendendo DDD, não tentes decorar dezenas de padrões.

Primeiro entende profundamente estes conceitos:

```text
1. Domain
2. Ubiquitous Language
3. Subdomain
4. Bounded Context
5. Entity
6. Value Object
7. Aggregate
8. Aggregate Root
9. Repository
10. Domain Service
11. Domain Event
12. Application Service
```

Depois entende:

```text
13. Context Map
14. Anti-Corruption Layer
15. Specification
16. Factory
17. CQRS
18. Event-Driven Architecture
19. Modular Monolith
20. DDD + Microservices
```

A sequência mental mais importante é:

```text
NEGÓCIO
   ↓
DOMAIN
   ↓
SUBDOMAINS
   ↓
BOUNDED CONTEXTS
   ↓
MODELO DE DOMÍNIO
   ↓
ENTITIES / VALUE OBJECTS
   ↓
AGGREGATES
   ↓
DOMAIN SERVICES / EVENTS
   ↓
APPLICATION
   ↓
INFRASTRUCTURE
```

O ponto central do DDD é **não começar pela tecnologia**.

Em vez de perguntar:

> "Como vou criar isso com FastAPI e PostgreSQL?"

primeiro pergunta:

> "Quais são os conceitos, regras e processos do negócio?"

Depois a tecnologia é usada para implementar esse modelo.
