#### Build serverless apps in JavaScript with SQL
SQL Joy is an [open/available source](#open-source-software) serverless framework for creating JavaScript web applications with a PostgreSQL database.
You query the database directly from the frontend app or call JavaScript functions which
execute on the server platform. SQL Joy can work with React, Vue, Svelte, or any frontend framework.
It is most comparable to [Firebase](https://github.com/sqljoy/sqljoy/blob/master/docs/pages/firebase.md),
PostgREST, and Hasura. SQL Joy lets you ergonomically:

Query from the browser:
```js
let results = await sj.executeQuery(sql`select * from users where id = ${user.id}`);
```
```json
{"id": 1, "name": "Luke Skywalker", "email": "skywalker@jedicouncil.galaxy"}
```

Or call backend code:

```js
// all in frontend.js
const API_ENDPOINT = "http://example.com"; 
export async function backendFunc(ctx, data) {
    const res = await fetch(API_ENDPOINT, {method: "POST", body: JSON.stringify(data)});
    return res.json();
}

let result = await backendFunc(sj.beginTx(), {"some": "JSON"});
```

There's no manual marshalling of data, no costly mental context switching between frontend and
backend code bases in different languages. Code can be freely shared between frontend and backend
without having to copy or move it. Read on to see how SQL Joy works.

 - [Query from the browser](#query-from-the-browser)
 - [Validation](#validation)
 - [Security](#security)
 - [Transactions](#transactions)
 - [Using privileged third party APIs](#using-privileged-third-party-apis)
 - [Design Considerations](#design-considerations)
 - [Use the right tool for the job](#use-the-right-tool-for-the-job)
 - [The Sweet Spot](#the-sweet-spot)
 - [The Dream](#the-dream)   
 - [Open Source Software](#open-source-software)

#### Query from the browser

Define a query using the sql template tag in JavaScript.

```js
const query = sql`SELECT * FROM users WHERE group = ${group}`;
```

That looks like asking for a SQL injection attack, but it's not a string substitution.
It gets compiled into a query object which keeps the params separate.

```js
> console.log(query)
```
```json
{"query": "SELECT * FROM users WHERE group = $0", "params": "TODO"}
```

Executing the query is as simple as

```js
const result = await fs.executeQuery(query);
```

The result is an iterator over JavaScript (JSON) objects

```js
> for (const user of result) {
> 	console.log(user);
> }
```
```json
{"id": 1, "username": "bob", ...}
```
```json
{"id": 2, "username": "alice", ...}
````

#### Validation

You can write insert or update queries the same way, but you're also going to want to
place some additional restrictions on what data can be saved, beyond the restrictions of the schema.

```js
function isValidEmail(params, errors) {
  const email = param["email"];
  // At minimum an email should be x@y.ab
  if (typeof email !== "string" || email.length < 6 ||
      email.indexOf('@', 1) < 0 || email.indexOf('.', 3) < 0) {
  	errors.add("email", "please enter a valid email address");
  }
}

let email = "not an email"; 
const changeEmail = sql`UPDATE users SET email = ${email}
                        WHERE id = %{SESSION.user_id}`;

// throws a ValidationError
const result = await fs.executeQuery(changeEmail, isValidEmail);
```

The isValidEmail function will run in the browser before sending the query, it will also run on
the server before executing the query. Note the use of a `%{SESSION}` variable here which
is replaced on the server-side with the value from the current user's session. This ensures
the user may only modify their own email address. Validation functions can also change the
types or values of parameters and can even run queries or call fetch.

#### Security

We've shown how SQL Joy protects against SQL injection attacks, and briefly touched on
how server-side trusted data, such as session variables, can be included in a query
defined in the frontend to restrict what rows can be returned in a query. It's not
safe to execute arbitrary queries against the database from an untrusted environment
like the browser - so how does SQL Joy seemingly accomplish that? It doesn't allow
executing arbitrary queries. SQL Joy can only run queries that are whitelisted.

The SQL Joy compiler replaces all queries with query objects. When the query is executed
a secure hash representing that query is sent, along with the parameters. The server looks
the hash up in the whitelist and executes the query only if it matches.

As this would be overly restrictive, SQL Joy can also combine whitelisted
queries and parts of queries to create seemingly dynamic queries - but all the
allowed combinations were detected statically and whitelisted by the compiler.
There aren't any queries allowed that haven't been explicitly created and
approved by the developers.

However, server backend functions have no such restrictions and can run
whitelisted as well as truly dynamic queries and even construct queries from
strings - but with great power comes great responsibility so be careful!

#### Transactions

Generally it's an anti-pattern to hold transactions open in an interactive session split
across a high latency link, such as between the browser and the server. Transactions hold
locks and block other transactions, so you want them to run as quickly as possible. The
ideal is to run all transactions inside stored procedures in the database. You can do that
with SQL Joy, but it's not always practical for other reasons. The next best thing is to run
your transaction close to the database. You can do that with backend server functions.

Writing and calling a backend function is really simple, and brings back good memories of
one of the things the Meteor framework did well:

```js
async function transferBalance(ctx, fromAccount, toAccount, amount) {
  const query = sql`SELECT balance FROM accounts WHERE id = ${fromAccount}`;
  const result = await ctx.executeQuery(query);
  
  const existingBalance = result.next().value;
  if (existingBalance == null || existingBalance < amount) {
    throw new Error("insufficient balance");
  }
  
  // Credit the destination account
  let account_id = toAccount;
  const update = sql`UPDATE accounts SET balance = balance + ${amount}
                     WHERE id = ${account_id}`;
  await ctx.executeQuery(update);
  
  // Debit the source account
  update.params["account_id"] = fromAccount;
  update.params["amount"] = -amount;
  await ctx.executeQuery(update);
  
  await ctx.commit();  
}

let fromAccount = 1401234;
let toAccount = 1409832;
await transferBalance(sj.beginTx(), fromAccount, toAccount, 100);
```

Here `transferBalance` executes on the server. The SQL Joy compiler lifts it completely
out of the frontend and compiles it into the backend code bundle which is what you deploy.
The call site at `await transferBalance` is turned into fetch invocation marshaling the
arguments as JSON and unmarshalling the JSON result. You can tell you're looking at a
backend function by the ctx first argument, and a backend call by the `sj.beginTx()` that
you must pass as the first argument. It may seem slightly magical, but it's done this way
so that if you add type annotations (e.g. TypeScript) then the compiler will check the
parameter and return types, and ensure you called it correctly by passing `sj.beginTx()`.

The compiler uses tree-shaking based on ES6 imports to lift functions out of the frontend.
Any code only referenced by backend functions will be completely removed. Shared functions will
be compiled into both frontend and backend. For this to work properly you must use ES6
imports between your frontend components. You should be doing this anyway though, and
most people are.

The end result of this is you can use share code almost freely between the frontend and backend.
This is still limited by differences between the frontend and backend environments - but
we're working at adding standard web APIs to the backend to fill in the gaps. Unlike node,
we don't add additional backend APIs, except for the special context object.

What's interesting about this is you can put your backend API function
in the same file as the component that calls it, or you can put them in adjacent files.
When a developers needs to know what happens in a particular edge case, the code for
the backend function is readily available and in the same language. In practice this
leads to fewer developers getting stuck waiting for answers from the backend team, fewer
meetings and disruptions via slack and email, and fewer bugs when developers didn't go
to the effort to verify the behavior of the backend code.

#### Using privileged third party APIs

One of the main tasks of a backend is to interact with privileged third-party APIs
that can't be used from the frontend because they require you to enforce security
around them. APIs like Stripe, Twilio, Mailgun, etc. You can do this in SQL Joy
by using the same standard fetch function you're used to in the browser.

```js
async function getAnswer(data) {
  const response = await fetch("https://example.com/answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    redirect: "error",
    body: JSON.stringify(data)
  });
  return response.json();
}

const answerData = await getAnswer({"answer": 42});
```

Server functions run on the [Deno](https://deno.land/) runtime. The cloud service, when available, will
use a strictly sandboxed version of Deno with some limitations in order to facilitate
running untrusted code safely on our servers.

Client libraries that work in the browser can usually be used without modification
or polyfills. Client libraries that expect to work in a NodeJS environment
likely will not work without polyfills. The community around Deno is really stepping up,
and the compatibility story gets better by the day. However, you should prefer to
use the REST APIs directly with fetch when possible, as it's more performant and
produces more useful logging and metrics.

We log fetch requests and responses, along with how long they take, which
really can speed up debugging issues with third-party integrations or identifying
performance bottlenecks. You can see at a glance when a third-party dependency goes
down and for how long and use that to hold them accountable to their SLAs.
These logs can be disabled in the configuration.

#### Design Considerations

As any experienced software developers knows, the entities that make the most sense
for storing your data into a database are not necessarily the same entities that
make the most sense for using in a UI.

However, SQL Joy is not an ORM. You can select arbitrary subsets of rows from
various tables and combine them into one "UI entity" just like you might
with a traditional backend. Remap those entities however you like, either on the frontend,
or on the backend using views or server functions.

Some astute readers may have noticed that exposing the database schema at
the client layer has implications for backward compatibility. If you rename
or remove a table or column, that would break existing sessions with the
old JavaScript code and queries. You could mitigate this to some extent by
using views, but SQL Joy employs a more direct solution. When you deploy
new code to the server it sends a version changed event to all connected
clients which will reload with the new, in sync, code and queries. Likewise,
if a client tries to connect with an older version the same thing will
happen during the opening handshake. This not only solves the schema problem,
but it solves a whole related class of backward compatibility problems that
are typical with traditional software stacks. Stop wasting time chasing down
that long tail of unreproducible bugs.

#### Use the right tool for the job

We gave you lots of reasons why you should give SQL Joy a try, but in the spirit of
radical transparency, which is a guiding principle for us, it's also important to talk
about where it may not the right tool for the job.

If you are publishing an API for third parties to use, then your backend _is_ the product. In
that case you don't want to use SQL queries directly from the frontend because they're harder
to make backwards compatible - and the REST API for developers not using SQL Joy would
be awkward. The server function call API produces a fairly sensible REST API, but it still doesn't
give you the discoverability of GraphQL or the flexibility of REST - and backwards compatibility
is still an issue. So if your product _is_ the backend, SQL Joy is likely not the right tool for the job.

If you're using microservices for the backend, then having SQL Joy bypass the backend
and interact with the database directly really breaks the design encapsulation
that you're trying to achieve. You could still use modules to separate components
similarly - but that takes discipline, and you'll be swimming upstream against the current.
Microservices are a terrible idea for so many reasons, but if that's your particular hell,
then adding SQL Joy to it is not going to improve things.

#### The Sweet Spot

SQL Joy reduces a lot of boilerplate code, and reduces bugs by making it trivial to switch
between frontend and backend code to ensure they're integrated correctly. When we have the
cloud service available it will also provide a fully serverless runtime environment where
you pay for what you use and don't have to worry about any of the tasks around server administration,
monitoring, scaling, etc.

However, the real sweet spot currently is that it's a technical workaround to an organizational
problem that many people are unaware of. If you have separate frontend and backend teams it's
terribly inefficient. You lose some 0-30% productivity at any point in time by
having the suboptimal balance between frontend and backend developers. You'll never be lucky
enough to have it balanced just right - and it changes over time. You also lose a tremendous
amount of velocity (latency - not throughput) in delivering features. If you've ever worked
in such an environment you know that adding a new feature looks something like this:

 - Have a series of cross-team meetings to sync on requirements
 - Put backend and frontend tasks into the respective team backlogs
 - Teams will prioritize the backlog items as they see fit
 - Eventually a backend developer gets assigned the task and creates the API endpoint
 - It gets code reviewed, merged, and deployed to staging/dev environment
 - The frontend team can now begin to integrate it with their work
 - The frontend team discovers there were some mismatches between what they expected and what was delivered
 - More meetings to sync over the changes that need to happen, and the cycle repeats

It's not unusual for this cycle to take anywhere from 2-8 weeks to complete a new feature.
You don't have to understand the Build-Measure-Learn feedback loop from the Lean Startup to
see why iteration at such a slow pace is devastating to the success of any software product.
This is an organizational anti-pattern, but it's very common because it's tough to find
developers with skills and experience running the full gamut of your software stack.

With SQL Joy, you still have developers who are more comfortable doing frontend or backend
development, but everyone can read, understand, and modify all the code. Rather than the
terribly slow cycle above a frontend developer can mock up or even fully build the API
they need, and reach out to an individual backend expert for advice or to complete
the work. You can convert two backlogs into one and have all developers working on the
highest priority work at any point in time. You have just one language to hire for
and fewer specific skills and experience required. This is the promise of universal JavaScript.

#### The Dream

The idea of universal JavaScript is not new, it's what motivated Ryan Dahl to create NodeJS
and now Deno. Being able to share code seamlessly across the frontend and backend is
really convenient, especially when it comes to validation. For security validation has
always needed to be done in the backend, but for timely user-feedback it also needs to
happen in the frontend.

JavaScript has matured into a respectable language that borrows inspiration
and modern features from languages like Python. It's the most popular programming
language in the world by a wide margin because of its use in the browser. Additionally,
with Microsoft having created TypeScript you can incrementally add an expressive and powerful type system to the language.
JavaScript tooling has also dramatically improved and modern JavaScript runtimes like V8 produce
very efficient code that is an order of magnitude faster than interpreted languages like
Python and Ruby.

With Deno smoothing out the differences between browser JavaScript and server JavaScript,
the time has really come for universal JavaScript. SQL Joy allows frontend and backend code
to cohabit and interoperate seamlessly without having to change how it's structure or move
or copy code across boundaries. We hope it makes the dream of universal JavaScript more competitive.

#### Open Source Software

It's important to be clear and honest about what parts of SQL Joy are open source under the OSI definition and what are not.
The client library, server runtime library, and CLI tools / compiler are all OSI open source under
the extremely permissive MIT license. The admin application is closed source and only free for small teams - but
it is merely a convenience and not required to use SQL Joy. The server itself is licensed under
the MIT License with [Commons Clause](https://commonsclause.com/) rider.

The Commons Clause rider prohibits selling the software or offering it as a paid service. 
It came about as a reaction to large cloud companies profiting off open-source software while giving
nothing back. As a result, the server is available source software with most of the rights and freedoms of
open source software, minus that one exception about being able to profit directly off it. One
may of course sell other products or services built with SQL Joy.

This is a balance we're trying to strike between giving as many rights and freedoms to
developers as possible without also preventing us from creating a profitable business on
top of it - which is what pays for the development and improvement of SQL Joy for everyone.
The Commons Clause is a short, simple, and elegant solution to the greatest flaw of OSI licenses.  









