executeQuery executes a compiled query (SQL) object with the optional additional
deferred `%{named}` parameters and validators.

Parameters with undefined value throw a ValidationError, because this can hide bugs.
If you want SQL NULL, pass null instead. You can use ${value || null} as a shortcut
if you want undefined to be null.

 The parameters passed to the validator will be the expressions embedded in the query.
 ```sql`select * from foo where id = ${foo.id} OR bar = ${2+foo}:bar OR name = %{name}` ``` will have
named parameters `{"id": foo.id, "bar": 2+foo, "name": undefined}`. Deferred parameters
 can be declared using the %{param} syntax, they must be provided in the params argument to
 this function, or it will throw a ValidationError. If a parameter does not have a name, it gets
assigned a unique numeric name. Use the :name suffix syntax to name query expressions
so that they can be validated. 
 
If there is a name conflict, a number is affixed to
the param name to make it unique. `${obj1.foo} ${obj2.foo}` becomes
 `{"foo": obj1.foo, "foo2": obj2.foo}` and will issue a warning at compile time and
runtime via console.warn. This usually happens when constructing a query out of
SQL fragments that contain the same param name. Use the :name syntax to give the params
unique names and suppress the warning.

The validators will be executed again on the server side to ensure they cannot be bypassed.
Validators can also change the type or values of the query parameters. Validators can be async
functions and can perform queries or fetch requests, although this will execute twice
and hurt query latency so use it sparingly. If you must do that, try enclosing it within
an `if (ENV_SERVER) { ... }` block so that it only executes once on the server side.
