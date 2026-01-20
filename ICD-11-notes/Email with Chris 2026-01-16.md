**From:** Sigfried Gold <[sigfried@jhu.edu](mailto:sigfried@jhu.edu)>  
**Sent:** Friday, January 16, 2026 2:08 PM  
**To:** Christopher Chute <[chute@jhu.edu](mailto:chute@jhu.edu)>  
**Subject:** ICD-11 next steps

I understand a lot more about ICD-11 but certainly have a ways to go. I think I need to try actually working on it -- which means I need some initial task. My general task, as I understand it, is to provide an exploratory interface (with authoring?) for people requesting and reviewing/approving changes made on the maintenance platform. I had a vague plan like:

- Study
	- Read all the papers and compile questions and comments. I’m done reading, but my notes are mostly handwritten on the documents and not yet organized.
	- Explore the browser and coding tool and try them out as ECTs (done)
	- Explore the Foundation (yes, but it’s still somewhat opaque to me)
	- Explore the ICD-API (have begun)
	- Explore the maintenance platform (have begun)
- Compile all my questions for you and Can
- Get some answers and start designing

I have way too many questions — a lot of them not that important or that I’ve somewhat figured out answers to. I tried to get Claude’s help organizing my questions and all the materials (I had the idea that the questions would be tied to the papers or webpages — I found an app that would help) and claude generated a ton more questions. You can see my notes and exploration plans as well as initial efforts at using the API and CTEs here: [https://github.com/Sigfried/icd11-playground](https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fgithub.com%2FSigfried%2Ficd11-playground&data=05%7C02%7Csigfried%40jhu.edu%7C6921d34ad7574ffffe8b08de55417f2c%7C9fa4f438b1e6473b803f86f8aedf0dec%7C0%7C0%7C639041936947036535%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=B%2FX41IkZ1hc3ZDnzmbMFdRsQQrJ4v70QkLfVyK02W7w%3D&reserved=0 "https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fgithub.com%2FSigfried%2Ficd11-playground&data=05%7C02%7Csigfried%40jhu.edu%7C6921d34ad7574ffffe8b08de55417f2c%7C9fa4f438b1e6473b803f86f8aedf0dec%7C0%7C0%7C639041936947036535%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=B%2FX41IkZ1hc3ZDnzmbMFdRsQQrJ4v70QkLfVyK02W7w%3D&reserved=0"), but it’s all kind of a mess.

The most important question I have now is, How would I interact with change proposals? Is there an API for the maintenance platform or some other way I would look at the change request data? I probably need to speak with Can for that.

I hope it’s clear that I’ve been taking so long because I want to do a great job (and am allocated on this at 10%) — I’ve just been making the less-than-perfect the enemy of the acceptable-for-now.

Do you have thoughts on what the next steps should be?

**From:** Christopher Chute <[chute@jhu.edu](mailto:chute@jhu.edu)>  
**Date:** Friday, January 16, 2026 at 3:54 PM  
**To:** Sigfried Gold <[sigfried@jhu.edu](mailto:sigfried@jhu.edu)>  
**Subject:** RE: ICD-11 next steps  

As Can said, we either have an external proposal generator over which you have complete control that is fed into the WHO system, or we wire code and function into the existing .NET system or at least make it callable and interoperable. Yes, that is a Can question.  Happy to answer other questions. Have you looked at example Foundation proposals in the real system (ICD Maintenance platform)?

**7pm:**
 Hi Chris,
**TL;DR**: Wiring stuff into the .NET system is probably the way to go. We would need to talk about the particular functionality we would provide in the new system.

I’ve started looking a bit. Trying to find my way around. Like, this one appears as the most recent change, but it doesn’t quite match what’s on the left (which _I think_ is the current Foundation hierarchy). I started trying to draw arrows to understand the correspondence. The proposal view’s indentation is off. I was able to find the question marked items in the Foundation by clicking on the parent, but in the proposal browser clicking on the parent brings up all the proposals related to that node, which confused me a bit.

  ![[Pasted image 20260120122044.png]]

Sorry, I had forgotten some details of our conversation. It’s been a very long time since I used .NET. I can see various problems with the current maintenance platform (e.g., no display of the number of search results or pages, just a next page button), but it’s clear a lot of work has been put into it and completely replacing it or otherwise creating an independent system that performs all its functions would be a big job. Certainly not possible at 10%. Wiring stuff into the .NET system is a possibility — we would need to talk about the particular functionality we would provide in the new system. I got the impression that the main thing you’re looking for is better representation of the Foundation structures. 

I’m having a hard time wrapping my head around the way proposals interact with MMS. I understand that post-coordination controls how clusters can be formed and how the coding tool works, but I’m unclear linearization generally. If there’s a change to Foundation structures, is there some deterministic way it will affect MMS or would it require manual changes? 

I realize I probably sound dumb, but I’ve only put two-three person-weeks into this, and I learn better by doing than studying. To answer your question, yes, I’ve looked at proposals (prior to today), but by the time I’ve tried to find answers to my questions or confusions without going to you or Can, I end up with a dozen more questions.

I appreciate your patience.