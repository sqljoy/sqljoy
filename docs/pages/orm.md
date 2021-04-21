### ORMs are not worth it

After 20 years in this industry, I no longer use ORMs in new projects, when
the decision is up to me. I believe they have failed at their stated purpose
and the cost in complexity and performance is not worth it.

Many, many developers have written at length about what's wrong with ORMs,
and they've made the point more eloquently than I can. I'll provide links
to some better ones below (if I left out a good one - submit a PR!)

However, I can summarize the chief argument against ORMs as follows.
To use an ORM effectively you must learn both the API of the ORM and SQL.
It does not absolve you from learning SQL, which I think was one of the
unstated attractions to junior developers. Then you have to map between
the API of the ORM and how it translates that to SQL under the hood.
Then you have to understand how it handles caching and sessions and how
that all works under the hood. This has been the source of so much
complexity and so many bugs over the years that I no longer think 
the benefits are worth the cost. As always, there are exceptions and caveats,
but I now believe it's better to use SQL directly than to use an ORM.
In general there is too much complexity in all the layers of abstraction
in software development these days, and I think the industry is strangely
blind to the consequences of this. Complexity is death to software, and it
should not be taken on lightly. The entire craft of a software engineer
boils down to eliminating complexity and simplifying problems, the better
you can do that, the more productive an engineer you will be.

### SQL Joy is not an ORM

For these reason, [SQL Joy](readme.md) is not, and will never be an ORM.
We're all for convenience and will definitely add some simple
and transparent convenience methods to make common tasks of
getting data out of the database, and saving data back to the database
easier in common cases. However, we will never take the heavy-handed 
approach of ORMs and will always shy away from complexity when
not clearly warranted.

### Further Reading

 - [Breaking Free From the ORM: Why Move On?](https://medium.com/building-the-system/dont-be-a-sucker-and-stop-using-orms-190add65add4)
 - [The Vietnam of Computer Science](http://blogs.tedneward.com/post/the-vietnam-of-computer-science/)
    - [Hacker News Discussion](https://news.ycombinator.com/item?id=14826496)
 - [Why I Stopped Using ORMs to Get the Job Done](https://fruty.io/2020/10/27/why-i-stopped-using-orms-to-get-the-job-done/)
 - [OrmHate - Martin Fowler](https://martinfowler.com/bliki/OrmHate.html)
     - [Hacker News Discussion](https://news.ycombinator.com/item?id=17120578)
 - [Why ORM is a harmful pattern and should be avoided](https://kurapov.ee/eng/tech/ORM-is-harfmul-pattern/)
 - [What ORMs have taught me: just learn SQL](https://wozniak.ca/blog/2014/08/03/1/index.html)
    - [Hacker News Discussion](https://news.ycombinator.com/item?id=11981045) 
 - [Are ORMs Solving Anything](https://wildermuth.com/2010/01/18/Are_ORMs_Solving_Anything)
 - [ORMs are backwards](https://abe-winter.github.io/2019/09/03/orms-backwards.html)
    - [Hacker News Discussion](https://news.ycombinator.com/item?id=20872571)

